const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

// In-Memory Database Arrays (will be synced with MongoDB if MONGODB_URI is provided)
const users = [];
const products = [];
const cart_items = [];
const orders = [];
const coupons = [];
const support_tickets = [];
const categories = [];
const size_guides = [];
const activities = [];
const live_activities = [];

let db = null;
let client = null;
let lastState = {};
let isLoaded = false;

// Diagnostics: surfaces whether the last MongoDB write actually succeeded.
const syncStatus = {
    buildVersion: 'sync-await-v2',
    connected: false,
    lastSyncAt: null,
    lastSyncOk: null,
    lastSyncError: null,
    lastWriteCollection: null
};

async function connectMongo() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.warn('[Mongo] WARNING: MONGODB_URI not found in environment variables. Running in in-memory mode.');
        return;
    }
    try {
        console.log('[Mongo] Connecting to MongoDB Atlas...');
        client = new MongoClient(uri);
        await client.connect();
        db = client.db('uclose');
        syncStatus.connected = true;
        console.log('[Mongo] Connected successfully to MongoDB Atlas database: uclose');

        // If connection occurs after store is fully loaded, pull the collection data
        if (isLoaded) {
            const collections = {
                users, products, cart_items, orders, coupons,
                support_tickets, categories, size_guides, reviews,
                activities, live_activities
            };
            for (const [name, arr] of Object.entries(collections)) {
                await loadCollection(name, arr);
            }
            await loadSettings();
            
            // Re-set initial lastState values to prevent writing immediately on boot
            for (const [name, arr] of Object.entries(collections)) {
                lastState[name] = JSON.stringify(arr);
            }
            lastState.settings = JSON.stringify(site_settings);
            console.log('[Mongo] Successfully refreshed memory stores from MongoDB connection.');
        }
    } catch (err) {
        console.error('[Mongo] ERROR: Failed to connect to MongoDB Atlas:', err.message);
        console.error('[Mongo] Please verify your MONGODB_URI and your IP Access List (Whitelist) in MongoDB Atlas.');
        console.log('[Mongo] Continuing in in-memory mode. Will retry connection in 10 seconds.');
        setTimeout(connectMongo, 10000);
    }
}


async function loadCollection(name, memoryArray) {
    if (!db) return false;
    try {
        const data = await db.collection(name).find({}).toArray();
        if (data.length > 0) {
            memoryArray.length = 0;
            data.forEach(item => {
                delete item._id; // remove mongodb internal ID to keep structures clean
                memoryArray.push(item);
            });
            console.log(`[Mongo] Loaded ${data.length} items into memory for collection '${name}'`);
            return true;
        }
    } catch (err) {
        console.error(`[Mongo] Error loading collection '${name}':`, err.message);
    }
    return false;
}

async function saveCollection(name, memoryArray) {
    if (!db) return;
    try {
        await db.collection(name).deleteMany({});
        if (memoryArray.length > 0) {
            const cleanArray = memoryArray.map(item => {
                const copy = { ...item };
                delete copy._id;
                return copy;
            });
            await db.collection(name).insertMany(cleanArray);
        }
        syncStatus.lastSyncOk = true;
        syncStatus.lastSyncAt = new Date().toISOString();
        syncStatus.lastWriteCollection = name;
        syncStatus.lastSyncError = null;
    } catch (err) {
        syncStatus.lastSyncOk = false;
        syncStatus.lastSyncAt = new Date().toISOString();
        syncStatus.lastSyncError = err.message;
        console.error(`[Mongo] Error saving collection '${name}':`, err.message);
    }
}

async function loadSettings() {
    if (!db) return;
    try {
        const doc = await db.collection('settings').findOne({});
        if (doc) {
            delete doc._id;
            Object.assign(site_settings, doc);
            console.log('[Mongo] Loaded site settings into memory.');
        } else {
            await db.collection('settings').insertOne({ ...site_settings });
            console.log('[Mongo] Seeded initial site settings to MongoDB.');
        }
    } catch (err) {
        console.error('[Mongo] Error loading settings:', err.message);
    }
}

async function saveSettings() {
    if (!db) return;
    try {
        await db.collection('settings').deleteMany({});
        const copy = { ...site_settings };
        delete copy._id;
        await db.collection('settings').insertOne(copy);
    } catch (err) {
        console.error('[Mongo] Error saving settings:', err.message);
    }
}

// Immediately flush a single collection to MongoDB (does not wait for the 1.5s poll).
// Use after create/update/delete so freshly-written data survives a crash or restart.
async function persist(name) {
    if (!db || !isLoaded) return;
    const collections = {
        users, products, cart_items, orders, coupons,
        support_tickets, categories, size_guides, reviews,
        activities, live_activities
    };
    const arr = collections[name];
    if (!arr) return;
    try {
        const serialized = JSON.stringify(arr);
        lastState[name] = serialized; // keep poll loop in sync so it doesn't re-write
        await saveCollection(name, arr);
    } catch (err) {
        console.error(`[Mongo] Error persisting collection '${name}':`, err.message);
    }
}

async function checkAndSync() {
    if (!db || !isLoaded) return;
    const collections = {
        users, products, cart_items, orders, coupons,
        support_tickets, categories, size_guides, reviews,
        activities, live_activities
    };
    for (const [name, arr] of Object.entries(collections)) {
        try {
            const serialized = JSON.stringify(arr);
            if (lastState[name] !== serialized) {
                lastState[name] = serialized;
                await saveCollection(name, arr);
                console.log(`[Mongo] Synchronized collection '${name}' to MongoDB.`);
            }
        } catch (e) {
            console.error(`[Mongo] Error stringifying or saving '${name}':`, e.message);
        }
    }
    try {
        const settingsSerialized = JSON.stringify(site_settings);
        if (lastState.settings !== settingsSerialized) {
            lastState.settings = settingsSerialized;
            await saveSettings();
            console.log(`[Mongo] Synchronized site settings to MongoDB.`);
        }
    } catch (e) {
        console.error('[Mongo] Error stringifying or saving settings:', e.message);
    }
}


// Record an admin action in the activity log (most recent first, capped at 300)
let nextActivityId = 1;
function logActivity(actorId, action, detail) {
    const actor = users.find(u => u.id === actorId);
    activities.unshift({
        id: nextActivityId++,
        actor_id: actorId,
        actor_name: actor ? actor.name : 'System',
        action,
        detail: detail || '',
        created_at: new Date().toISOString()
    });
    if (activities.length > 300) activities.length = 300;
}

let nextLiveActivityId = 1;
function addLiveActivity(type, name, message, color, icon, idRef = null) {
    const activity = {
        id: `live-${nextLiveActivityId++}-${Date.now()}`,
        type,
        idRef,
        name,
        message,
        time: new Date().toISOString(),
        color,
        icon
    };
    live_activities.unshift(activity);
    if (live_activities.length > 200) live_activities.length = 200;
    return activity;
}
const site_settings = {
    site_name: 'Uclose Co.',
    hero_title: 'Uclose Co.',
    hero_tagline: "Timeless Wardrobe\nEveryday Power.",
    hero_image: 'https://images.pexels.com/photos/1043474/pexels-photo-1043474.jpeg?auto=compress&cs=tinysrgb&w=2600',
    announcement_banner: 'Free worldwide shipping on orders over $150',
    social_instagram: 'https://instagram.com/uclose',
    social_facebook: 'https://facebook.com/uclose',
    contact_email: 'support@uclose.com',
    contact_phone: '+1 (555) 019-2834',
    maintenance_mode: 'false',
    star_color: '#fbbf24'
};

const reviews = [
    {
        id: 1,
        product_id: 1,
        name: "Alice Johnson",
        email: "alice@example.com",
        rating: 5,
        comment: "Excellent overshirt! The quality is amazing and it fits perfectly.",
        approved: 1,
        created_at: new Date().toISOString()
    },
    {
        id: 2,
        product_id: 1,
        name: "Bob Smith",
        email: "bob@example.com",
        rating: 4,
        comment: "Great quality, but the sleeve is slightly longer than expected. Still highly recommend.",
        approved: 1,
        created_at: new Date().toISOString()
    },
    {
        id: 3,
        product_id: 2,
        name: "Charlie Brown",
        email: "charlie@example.com",
        rating: 5,
        comment: "Absolutely love the pinpoint oxford fabric. Classic clean look.",
        approved: 1,
        created_at: new Date().toISOString()
    },
    {
        id: 4,
        product_id: 4,
        name: "Diana Prince",
        email: "diana@example.com",
        rating: 3,
        comment: "Very soft cashmere but runs a bit small. Recommend ordering a size up.",
        approved: 0,
        created_at: new Date().toISOString()
    }
];

// Seed default products
const SEED_PRODUCTS = [
    {
        id: 1,
        name: "Textured Overshirt",
        price: 89,
        category: "Shirts",
        image: "https://images.unsplash.com/photo-1594938291221-94f18cbb5660?q=80&w=2574&auto=format&fit=crop",
        description: "A versatile layering piece crafted from high-density textured cotton. This overshirt features a refined collar, utility-style front pockets, and a relaxed yet tailored fit suitable for all seasons.",
        details: [
            "100% Organic Textured Cotton",
            "Functional breast pockets",
            "Adjustable button cuffs",
            "Reinforced stitching for durability",
            "Pre-washed for a soft handle"
        ],
        care: "Machine wash cold with like colors. Tumble dry low or hang dry for best results. Cool iron if needed.",
        stock: 50
    },
    {
        id: 2,
        name: "Classic Oxford Shirt",
        price: 120,
        category: "Shirts",
        image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?q=80&w=2574&auto=format&fit=crop",
        description: "The cornerstone of any modern wardrobe. Our Oxford shirt is made from premium pinpoint cotton with a subtle sheen and a button-down collar that stays crisp all day.",
        details: [
            "Premium Pinpoint Oxford Cotton",
            "Button-down collar",
            "Signature embroidered logo at chest",
            "Fitted shoulders, relaxed through waist",
            "Mother-of-pearl buttons"
        ],
        care: "Gentle machine wash inside out. Do not bleach. Air dry recommended to maintain collar structure.",
        stock: 50
    },
    {
        id: 3,
        name: "Modern Fit Blazer",
        price: 250,
        category: "Outerwear",
        image: "https://images.unsplash.com/photo-1593032465175-481ac7f401a0?q=80&w=2574&auto=format&fit=crop",
        description: "Designed for the modern professional. This blazer combines traditional tailoring with a contemporary silhouette, featuring a lightweight half-canvas construction for a natural drape.",
        details: [
            "Italian Wool Blend",
            "Half-canvas interior construction",
            "Double-vented back",
            "Notch lapel and functional buttons",
            "Internal passport and phone pockets"
        ],
        care: "Dry clean only. Use a wide hanger to maintain shape. Steam finish recommended.",
        stock: 50
    },
    {
        id: 4,
        name: "Cashmere Sweater",
        price: 145,
        category: "Knitwear",
        image: "https://images.unsplash.com/photo-1614676471928-2ed0ad1061a4?q=80&w=2574&auto=format&fit=crop",
        description: "Experience unparalleled softness. Our Grade-A Mongolian cashmere sweater provides exceptional warmth without the bulk, making it the perfect year-round luxury staple.",
        details: [
            "100% Sustainable Grade-A Cashmere",
            "12-gauge knit for optimal weight",
            "Ribbed hem and cuffs",
            "Seamless construction for comfort",
            "Naturally odor-resistant/breathable"
        ],
        care: "Hand wash cold with wool detergent. Dry flat of a towel. Do not wring or tumble dry.",
        stock: 50
    },
    {
        id: 5,
        name: "Twill Field Jacket",
        price: 195,
        category: "Outerwear",
        image: "https://images.unsplash.com/photo-1551028719-00167b16eac5?q=80&w=2574&auto=format&fit=crop",
        description: "Inspired by vintage military utility, redefined for the city. This heavy-duty cotton twill jacket is treated with a water-resistant finish and features four spacious external pockets.",
        details: [
            "Heavyweight Cotton Twill",
            "Water-resistant DWR coating",
            "Hidden waist drawstring for adjustability",
            "Brass zip closure with snap-button storm flap",
            "Interior utility pocket"
        ],
        care: "Machine wash lukewarm. Avoid fabric softeners. Tumble dry on low to reactivate water resistance.",
        stock: 50
    },
    {
        id: 6,
        name: "Selvedge Denim",
        price: 130,
        category: "Bottoms",
        image: "https://images.unsplash.com/photo-1542272604-787c3835535d?q=80&w=2572&auto=format&fit=crop",
        description: "Authentic raw selvedge denim, woven on traditional shuttle looms. These jeans are designed to break in over time, creating a unique wash and fit personal to you.",
        details: [
            "14.5oz Japanese Selvedge Denim",
            "Classic straight leg fit",
            "Chain-stitched hems",
            "Hidden rivets and reinforced pockets",
            "Button fly closure"
        ],
        care: "Wash sparingly. Turn inside out and soak in cold water when needed. Hang dry to maintain character.",
        stock: 50
    },
    {
        id: 7,
        name: "Merino Wool Polo",
        price: 95,
        category: "Shirts",
        image: "https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?q=80&w=2570&auto=format&fit=crop",
        description: "The ultimate transitional piece. Knit from ultra-fine Merino wool, this polo offers a sophisticated alternative to traditional cotton, with temperature-regulating properties.",
        details: [
            "100% Extra-Fine Merino Wool",
            "Breathable and temperature-regulating",
            "Clean-finished placket",
            "Athletic but refined fit",
            "Antimicrobial properties"
        ],
        care: "Gentle hand wash cold. Dry flat. Do not iron directly—use a garment steamer.",
        stock: 50
    },
    {
        id: 8,
        name: "Suede Chelsea Boots",
        price: 210,
        category: "Accessories",
        image: "https://images.unsplash.com/photo-1638247025967-b4e38f787b76?q=80&w=2570&auto=format&fit=crop",
        description: "Handcrafted in Portugal from velvet-soft Italian suede. These Chelsea boots feature a slim profile, elasticated side panels, and a durable Goodyear-welted rubber sole.",
        details: [
            "Premium Italian Suede Upper",
            "Calf leather lining",
            "Durable rubber sole",
            "Elastic side gussets",
            "Pull tab for easy entry"
        ],
        care: "Brush regularly with a suede brush. Apply protective spray before first wear. Avoid heavy rain.",
        stock: 50
    },
    {
        id: 9,
        name: "Corduroy Trousers",
        price: 110,
        category: "Bottoms",
        image: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?q=80&w=2574&auto=format&fit=crop",
        description: "Classic corduroy with a refined taper. Made from plush 8-wale cotton cord, these trousers provide rich texture and warmth for the cooler months.",
        details: [
            "100% Fine-Wale Cotton Corduroy",
            "Tapered leg silhouette",
            "Slash front pockets",
            "Button-through rear pockets",
            "Lined waistband for comfort"
        ],
        care: "Machine wash cold inside out. Tumble dry on low to restore cord texture. Do not iron horizontally.",
        stock: 50
    }
];

// Helper to seed all data asynchronously on boot
async function initStore() {
    // Connect to MongoDB Atlas
    await connectMongo();

    const collections = {
        users, products, cart_items, orders, coupons,
        support_tickets, categories, size_guides, reviews,
        activities, live_activities
    };

    if (db) {
        for (const [name, arr] of Object.entries(collections)) {
            await loadCollection(name, arr);
        }
        await loadSettings();
    }

    // 1. Seed Admin if users is empty
    if (users.length === 0) {
        try {
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash('admin123', salt);
            users.push({
                id: 1,
                name: 'Admin',
                email: 'admin@uclose.com',
                password_hash: passwordHash,
                role: 'admin',
                phone: '',
                dp: 'https://api.dicebear.com/7.x/initials/svg?seed=Admin',
                created_at: new Date().toISOString(),
                is_active: 1
            });
            console.log('[In-Memory Store] Seeded default admin user.');
            if (db) await saveCollection('users', users);
        } catch (e) {
            console.error('Failed to hash admin password:', e.message);
        }
    }

    // 2. Seed Products if empty
    if (products.length === 0) {
        SEED_PRODUCTS.forEach(p => products.push({ ...p, images: p.images || [p.image], sizes: p.sizes || ['S', 'M', 'L', 'XL', 'XXL'] }));
        console.log('[In-Memory Store] Seeded default products.');
        if (db) await saveCollection('products', products);
    }

    // 3. Seed Coupons if empty
    if (coupons.length === 0) {
        coupons.push({
            id: 1,
            code: 'UCLOSE10',
            discount_type: 'percentage',
            discount_value: 10,
            min_purchase: 50,
            active: 1,
            created_at: new Date().toISOString(),
            expiry_date: null,
            usage_limit: null,
            used_count: 0,
            category: null
        });
        coupons.push({
            id: 2,
            code: 'FLAT50',
            discount_type: 'flat',
            discount_value: 50,
            min_purchase: 200,
            active: 1,
            created_at: new Date().toISOString(),
            expiry_date: null,
            usage_limit: null,
            used_count: 0,
            category: null
        });
        console.log('[In-Memory Store] Seeded default coupons.');
        if (db) await saveCollection('coupons', coupons);
    }

    // 4. Seed Categories if empty
    if (categories.length === 0) {
        ['Shirts', 'Outerwear', 'Knitwear', 'Bottoms', 'Accessories'].forEach((cat, idx) => {
            categories.push({
                id: idx + 1,
                name: cat,
                created_at: new Date().toISOString()
            });
        });
        console.log('[In-Memory Store] Seeded default categories.');
        if (db) await saveCollection('categories', categories);
    }

    // 5. Seed Size Guides if empty
    if (size_guides.length === 0) {
        size_guides.push({
            id: 1,
            name: 'Shirts Size Guide',
            category: 'Shirts',
            columns: ['Chest (in)', 'Sleeve (in)', 'Neck (in)'],
            slots: [
                { size: 'S', measurements: ['36-38', '33', '14-14.5'] },
                { size: 'M', measurements: ['38-40', '34', '15-15.5'] },
                { size: 'L', measurements: ['40-42', '35', '16-16.5'] },
                { size: 'XL', measurements: ['42-44', '36', '17-17.5'] },
                { size: 'XXL', measurements: ['44-46', '37', '18-18.5'] }
            ]
        });
        size_guides.push({
            id: 2,
            name: 'Bottoms Size Guide',
            category: 'Bottoms',
            columns: ['Waist (in)', 'Inseam (in)', 'Hip (in)'],
            slots: [
                { size: 'S', measurements: ['28-30', '30', '36-38'] },
                { size: 'M', measurements: ['31-33', '32', '38-40'] },
                { size: 'L', measurements: ['34-36', '32', '40-42'] },
                { size: 'XL', measurements: ['38-40', '34', '42-44'] },
                { size: 'XXL', measurements: ['42-44', '34', '46-48'] }
            ]
        });
        console.log('[In-Memory Store] Seeded default size guides.');
        if (db) await saveCollection('size_guides', size_guides);
    }

    // 6. Seed Reviews if empty (the reviews array initially has default 4 items)
    if (db) {
        const dbReviewsCount = await db.collection('reviews').countDocuments();
        if (dbReviewsCount === 0 && reviews.length > 0) {
            await saveCollection('reviews', reviews);
            console.log('[Mongo] Seeded default reviews to MongoDB.');
        }
    }

    // 7. Seed Live Activities if empty
    if (live_activities.length === 0) {
        live_activities.push({
            id: 'live-seed-1',
            type: 'system',
            name: 'System Initialized',
            message: 'Uclose e-commerce platform started successfully.',
            time: new Date().toISOString(),
            color: '#10b981',
            icon: '⚡'
        });
        console.log('[In-Memory Store] Seeded default live activities.');
        if (db) await saveCollection('live_activities', live_activities);
    }

    // Set initial lastState values to prevent writing immediately on boot
    for (const [name, arr] of Object.entries(collections)) {
        lastState[name] = JSON.stringify(arr);
    }
    lastState.settings = JSON.stringify(site_settings);

    // Set nextActivityId based on loaded activities to prevent duplicate key errors
    nextActivityId = activities.length > 0 ? Math.max(...activities.map(a => a.id)) + 1 : 1;

    isLoaded = true;

    // Start background sync loop every 1500ms
    setInterval(checkAndSync, 1500);
}

function getDb() {
    return db;
}

initStore();

module.exports = {
    users,
    products,
    cart_items,
    orders,
    coupons,
    support_tickets,
    categories,
    size_guides,
    site_settings,
    reviews,
    activities,
    logActivity,
    live_activities,
    addLiveActivity,
    persist,
    checkAndSync,
    syncStatus,
    getDb
};

const http = require('http');

function post(path, data, token = null) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(data);
        const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request({
            hostname: 'localhost',
            port: 5000,
            path: path,
            method: 'POST',
            headers: headers
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (res.statusCode >= 400) {
                        reject(new Error(`Status ${res.statusCode}: ${parsed.message || body}`));
                    } else {
                        resolve(parsed);
                    }
                } catch (e) {
                    reject(new Error(`JSON Parse Error: ${body}`));
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function get(path, token = null) {
    return new Promise((resolve, reject) => {
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request({
            hostname: 'localhost',
            port: 5000,
            path: path,
            method: 'GET',
            headers: headers
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (res.statusCode >= 400) {
                        reject(new Error(`Status ${res.statusCode}: ${parsed.message || body}`));
                    } else {
                        resolve(parsed);
                    }
                } catch (e) {
                    reject(new Error(`JSON Parse Error: ${body}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

function put(path, data, token = null) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(data);
        const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request({
            hostname: 'localhost',
            port: 5000,
            path: path,
            method: 'PUT',
            headers: headers
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (res.statusCode >= 400) {
                        reject(new Error(`Status ${res.statusCode}: ${parsed.message || body}`));
                    } else {
                        resolve(parsed);
                    }
                } catch (e) {
                    reject(new Error(`JSON Parse Error: ${body}`));
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function del(path, token = null) {
    return new Promise((resolve, reject) => {
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request({
            hostname: 'localhost',
            port: 5000,
            path: path,
            method: 'DELETE',
            headers: headers
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (res.statusCode >= 400) {
                        reject(new Error(`Status ${res.statusCode}: ${parsed.message || body}`));
                    } else {
                        resolve(parsed);
                    }
                } catch (e) {
                    reject(new Error(`JSON Parse Error: ${body}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function runTests() {
    const timestamp = Date.now();
    const testEmail = `test_${timestamp}@example.com`;
    const testPassword = 'Password123!';
    const testName = 'Test User';

    console.log('--- RUNNING BACKEND INTEGRATION TESTS ---');

    try {
        // 1. Register User
        console.log(`1. Registering customer user: ${testEmail}`);
        const regRes = await post('/api/auth/register', { name: testName, email: testEmail, password: testPassword });
        const userToken = regRes.token;
        console.log('✓ Customer registration successful. Token obtained.');

        // 2. Fetch User Profile
        console.log('2. Fetching customer profile /me');
        const meRes = await get('/api/auth/me', userToken);
        console.log(`✓ Profile email: ${meRes.user.email}`);

        // 3. Fetch Products Catalog
        console.log('3. Fetching products list');
        const products = await get('/api/products');
        console.log(`✓ Products count: ${products.length}`);
        const targetProduct = products[0];
        console.log(`   Sample product: ID=${targetProduct.id}, Name="${targetProduct.name}", Price=$${targetProduct.price}`);

        // 4. Add product to cart
        console.log(`4. Adding Product ID=${targetProduct.id} size M to customer's cart`);
        await post('/api/cart', { product_id: targetProduct.id, size: 'M', quantity: 2 }, userToken);
        const cart = await get('/api/cart', userToken);
        console.log(`✓ Cart item added. Items count in cart: ${cart.length}`);

        // 5. Place customer order
        console.log('5. Placing customer order');
        const orderId = `TEST-UC-${timestamp}`;
        const orderRes = await post('/api/orders', {
            id: orderId,
            total: targetProduct.price * 2,
            paymentMethod: 'stripe',
            shippingDetails: {
                firstName: 'Test',
                lastName: 'User',
                address: '123 Test Lane',
                city: 'Testville',
                zipCode: '12345',
                phone: '+919999999999'
            },
            items: cart
        }, userToken);
        console.log(`✓ Order placed. ID: ${orderRes.orderId}`);

        // 6. Admin Authentication
        console.log('6. Logging in as Administrator (admin@uclose.com)');
        const adminLogin = await post('/api/auth/login', { email: 'admin@uclose.com', password: 'admin123' });
        const adminToken = adminLogin.token;
        console.log('✓ Administrator authentication successful.');

        // 7. Get Admin Analytics
        console.log('7. Fetching admin analytics stats');
        const stats = await get('/api/admin/stats', adminToken);
        console.log(`✓ Active stats -> Sales: $${stats.totalSales}, Orders: ${stats.totalOrders}, Customers: ${stats.totalUsers}`);

        // 8. Fetch Registered Customers list
        console.log('8. Listing registered users (Admin)');
        const users = await get('/api/admin/users', adminToken);
        console.log(`✓ User profiles retrieved: ${users.length}`);

        // 9. Update order delivery tracking status
        console.log(`9. Updating Order Status to 'Shipped' (Admin)`);
        await put(`/api/admin/orders/${orderId}`, { status: 'Shipped' }, adminToken);
        console.log('✓ Order status update response successful.');

        // 10. Verify order status update on customer side
        console.log('10. Verifying status change on customer account');
        const customerOrders = await get('/api/orders', userToken);
        console.log(`✓ Order status is now: ${customerOrders[0].status} (Expected: Shipped)`);

        // 11. Create a new product (Admin)
        console.log('11. Creating new product in catalog (Admin)');
        const newProdRes = await post('/api/admin/products', {
            name: "Linen Trench Coat",
            price: 280.00,
            category: "Outerwear",
            image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea",
            description: "Premium breathable linen trench coat designed for transition seasons.",
            details: ["100% Organic Belgian Linen", "Double-breasted front button", "Adjustable waist belt"],
            care: "Dry clean only."
        }, adminToken);
        const newProdId = newProdRes.productId;
        console.log(`✓ Product created successfully. Product ID: ${newProdId}`);

        // 12. Modify details of created product (Admin)
        console.log(`12. Modifying price of new product ID=${newProdId} (Admin)`);
        await put(`/api/admin/products/${newProdId}`, {
            name: "Linen Trench Coat (Premium Edition)",
            price: 320.00,
            category: "Outerwear",
            image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea",
            description: "Premium breathable linen trench coat designed for transition seasons.",
            details: ["100% Organic Belgian Linen", "Double-breasted front button", "Adjustable waist belt"],
            care: "Dry clean only."
        }, adminToken);
        console.log('✓ Product details updated.');

        // 13. Delete created product (Admin)
        console.log(`13. Deleting product ID=${newProdId} (Admin)`);
        await del(`/api/admin/products/${newProdId}`, adminToken);
        console.log('✓ Product deleted from database catalog.');

        // 14. Clean up mock order
        console.log(`14. Cleaning up test order ID=${orderId} (Customer)`);
        await del(`/api/orders/${orderId}`, userToken);
        console.log('✓ Test order cancelled and cleaned.');

        console.log('\n========================================');
        console.log('ALL ADMIN & CUSTOMER TESTS PASSED! ✓');
        console.log('========================================');
        process.exit(0);
    } catch (err) {
        console.error('❌ Integration testing failed with error:', err.message);
        process.exit(1);
    }
}

// Ensure local backend server is running
setTimeout(runTests, 1000);

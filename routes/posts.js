const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const postsFilePath = path.join(__dirname, '../posts.json');

// Helper to read posts from file
function readPosts() {
    try {
        if (!fs.existsSync(postsFilePath)) {
            fs.writeFileSync(postsFilePath, JSON.stringify([]));
            return [];
        }
        const data = fs.readFileSync(postsFilePath, 'utf8');
        return JSON.parse(data || '[]');
    } catch (e) {
        console.error('Error reading posts file:', e.message);
        return [];
    }
}

// Helper to write posts to file
function writePosts(posts) {
    try {
        fs.writeFileSync(postsFilePath, JSON.stringify(posts, null, 2), 'utf8');
    } catch (e) {
        console.error('Error writing posts file:', e.message);
    }
}

// 1. GET /api/posts - Fetch all posts (with filtering & pagination)
router.get('/', (req, res) => {
    try {
        let posts = readPosts();

        // Query filtering: Filter by author if query parameter is provided
        if (req.query.author) {
            const authorQuery = req.query.author.trim().toLowerCase();
            posts = posts.filter(p => p.author && p.author.toLowerCase().includes(authorQuery));
        }

        // Pagination query parameters
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        
        const total = posts.length;
        const totalPages = Math.ceil(total / limit);

        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        
        const paginatedPosts = posts.slice(startIndex, endIndex);

        res.json({
            total,
            page,
            limit,
            totalPages,
            posts: paginatedPosts
        });
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

// 2. GET /api/posts/:id - Fetch post by ID (with 404 error handler)
router.get('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const posts = readPosts();
        const post = posts.find(p => p.id === id);

        if (!post) {
            return res.status(404).json({ message: `Blog post with ID ${id} not found.` });
        }

        res.json(post);
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

// 3. POST /api/posts - Create a new post (with input validation)
router.post('/', (req, res) => {
    try {
        const { title, content, author } = req.body;

        // Custom validation: Validate title and content not empty
        if (!title || !title.trim() || !content || !content.trim()) {
            return res.status(400).json({ 
                message: 'Validation Error: Title and content are required and cannot be empty.' 
            });
        }

        const posts = readPosts();
        const nextId = posts.length > 0 ? Math.max(...posts.map(p => p.id)) + 1 : 1;

        const newPost = {
            id: nextId,
            title: title.trim(),
            content: content.trim(),
            author: author && author.trim() ? author.trim() : 'Anonymous',
            created_at: new Date().toISOString()
        };

        posts.push(newPost);
        writePosts(posts);

        res.status(201).json({
            message: 'Blog post created successfully.',
            post: newPost
        });
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

// 4. PUT /api/posts/:id - Update a post by ID
router.put('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { title, content, author } = req.body;

        // Validation for partial edits if fields are supplied
        if (title !== undefined && !title.trim()) {
            return res.status(400).json({ message: 'Validation Error: Title cannot be empty.' });
        }
        if (content !== undefined && !content.trim()) {
            return res.status(400).json({ message: 'Validation Error: Content cannot be empty.' });
        }

        const posts = readPosts();
        const postIndex = posts.findIndex(p => p.id === id);

        if (postIndex === -1) {
            return res.status(404).json({ message: `Blog post with ID ${id} not found.` });
        }

        const post = posts[postIndex];
        if (title !== undefined) post.title = title.trim();
        if (content !== undefined) post.content = content.trim();
        if (author !== undefined) post.author = author.trim() || 'Anonymous';

        writePosts(posts);

        res.json({
            message: 'Blog post updated successfully.',
            post
        });
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

// 5. DELETE /api/posts/:id - Delete a post by ID
router.delete('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const posts = readPosts();
        const index = posts.findIndex(p => p.id === id);

        if (index === -1) {
            return res.status(404).json({ message: `Blog post with ID ${id} not found.` });
        }

        posts.splice(index, 1);
        writePosts(posts);

        res.json({ message: `Blog post with ID ${id} deleted successfully.` });
    } catch (err) {
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
});

module.exports = router;

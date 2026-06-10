// Server-Sent Events (SSE) Broadcast Service
const clients = [];

function registerClient(req, res) {
    // Set appropriate headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for Nginx if any
    res.flushHeaders(); // Send headers to establish stream connection

    const client = {
        id: Date.now(),
        res
    };
    clients.push(client);
    console.log(`[SSE Service] Admin client connected. Total clients: ${clients.length}`);

    // Heartbeat to keep connection alive
    const keepAlive = setInterval(() => {
        res.write(': keepalive\n\n');
    }, 30000);

    req.on('close', () => {
        clearInterval(keepAlive);
        const index = clients.findIndex(c => c.id === client.id);
        if (index !== -1) {
            clients.splice(index, 1);
        }
        console.log(`[SSE Service] Admin client disconnected. Total clients: ${clients.length}`);
    });
}

function broadcast(event, data) {
    console.log(`[SSE Service] Broadcasting event "${event}" to ${clients.length} clients`);
    clients.forEach(client => {
        client.res.write(`event: ${event}\n`);
        client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    });
}

module.exports = {
    registerClient,
    broadcast
};

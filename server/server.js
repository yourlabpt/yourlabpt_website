require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, '..')));

// Create inquiries directory if it doesn't exist
const inquiriesDir = path.join(__dirname, 'inquiries');
if (!fs.existsSync(inquiriesDir)) {
    fs.mkdirSync(inquiriesDir, { recursive: true });
}

// Save inquiry endpoint
app.post('/api/save-inquiry', (req, res) => {
    try {
        const inquiry = req.body;
        
        // Validate required fields
        if (!inquiry.contact || !inquiry.contact.email) {
            return res.status(400).json({ 
                error: 'Email is required' 
            });
        }

        // Create a unique filename based on email and timestamp
        const sanitizedEmail = inquiry.contact.email.replace(/[^a-zA-Z0-9]/g, '_');
        const timestamp = new Date().toISOString().replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `${sanitizedEmail}_${timestamp}.json`;
        const filepath = path.join(inquiriesDir, filename);

        // Save inquiry to file
        fs.writeFileSync(
            filepath,
            JSON.stringify(inquiry, null, 2)
        );

        console.log(`✅ Inquiry saved: ${filename}`);

        res.json({
            success: true,
            message: 'Inquiry saved successfully',
            inquiryId: filename
        });
    } catch (error) {
        console.error('Error saving inquiry:', error);
        res.status(500).json({
            error: 'Failed to save inquiry',
            details: error.message
        });
    }
});

// Get all inquiries (admin endpoint)
app.get('/api/inquiries', (req, res) => {
    try {
        const files = fs.readdirSync(inquiriesDir);
        const inquiries = [];

        files.forEach(file => {
            if (file.endsWith('.json')) {
                const filepath = path.join(inquiriesDir, file);
                const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                inquiries.push({
                    filename: file,
                    ...data
                });
            }
        });

        // Sort by timestamp (newest first)
        inquiries.sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );

        res.json({
            count: inquiries.length,
            inquiries: inquiries
        });
    } catch (error) {
        console.error('Error reading inquiries:', error);
        res.status(500).json({
            error: 'Failed to read inquiries',
            details: error.message
        });
    }
});

// Get single inquiry
app.get('/api/inquiries/:id', (req, res) => {
    try {
        const filepath = path.join(inquiriesDir, req.params.id + '.json');
        
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'Inquiry not found' });
        }

        const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        res.json(data);
    } catch (error) {
        console.error('Error reading inquiry:', error);
        res.status(500).json({
            error: 'Failed to read inquiry',
            details: error.message
        });
    }
});

// Delete inquiry
app.delete('/api/inquiries/:id', (req, res) => {
    try {
        const filepath = path.join(inquiriesDir, req.params.id + '.json');
        
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'Inquiry not found' });
        }

        fs.unlinkSync(filepath);
        res.json({
            success: true,
            message: 'Inquiry deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting inquiry:', error);
        res.status(500).json({
            error: 'Failed to delete inquiry',
            details: error.message
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        inquiriesCount: fs.readdirSync(inquiriesDir).filter(f => f.endsWith('.json')).length
    });
});

// Serve index.html for any unmatched routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 YourLab Chat API running on http://localhost:${PORT}`);
    console.log(`📁 Inquiries stored in: ${inquiriesDir}`);
});

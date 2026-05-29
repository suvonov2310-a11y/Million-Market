require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const http = require('http');
const { Server } = require('socket.io');

// Cloudinary paketlari
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB: Baza muvaffaqiyatli ulandi!'))
    .catch(err => console.log('MongoDB xatosi:', err));

// --- CLOUDINARY SOZLAMALARI ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'million_market_products',
        allowedFormats: ['jpeg', 'png', 'jpg', 'webp']
    }
});
const upload = multer({ storage });

// --- MODELLAR ---
const User = mongoose.model('User', new mongoose.Schema({ 
    fullName: { type: String, required: true }, phone: { type: String, required: true, unique: true }, 
    password: { type: String, required: true }, createdAt: { type: Date, default: Date.now } 
}));

const Product = mongoose.model('Product', new mongoose.Schema({ 
    name: { type: String, required: true }, category: { type: String, required: true }, 
    price: { type: Number, required: true }, oldPrice: { type: Number, default: 0 }, 
    description: { type: String, default: '' }, img: String, inStock: { type: Boolean, default: true },
    reviews: [{ 
        author: String, text: String, date: { type: Date, default: Date.now }, adminReply: { type: String, default: '' }
    }]
}));

const Category = mongoose.model('Category', new mongoose.Schema({ name: String }));

const Order = mongoose.model('Order', new mongoose.Schema({ 
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, 
    customerName: String, customerPhone: String, location: String, deliveryMethod: String, 
    totalSum: Number, cart: Array, status: { type: String, default: 'Kutilmoqda' }, 
    date: { type: Date, default: Date.now } 
}));

// --- MIDDLEWARELAR ---
const verifyAdmin = (req, res, next) => {
    try { const token = req.headers['authorization'].split(' ')[1]; if (jwt.verify(token, process.env.JWT_SECRET).role !== 'admin') throw new Error(); next(); } 
    catch (err) { res.status(403).json({ message: "Admin emas!" }); }
};
const verifyUser = (req, res, next) => {
    try { req.userId = jwt.verify(req.headers['authorization'].split(' ')[1], process.env.JWT_SECRET).userId; next(); } 
    catch (err) { res.status(401).json({ message: "Tizimga kiring!" }); }
};

// --- CHAT VA JONLI BILDIRISHNOMALAR ---
const chatHistory = {};
io.on('connection', (socket) => {
    socket.on('getAdminChats', () => socket.emit('loadAllChats', chatHistory));
    socket.on('clientMessage', (data) => {
        if (!chatHistory[socket.id]) chatHistory[socket.id] = { name: data.name, messages: [] };
        chatHistory[socket.id].messages.push({ sender: 'client', msg: data.msg });
        io.emit('receiveClientMessage', { id: socket.id, msg: data.msg, name: data.name });
    });
    socket.on('adminReply', (data) => {
        if (chatHistory[data.clientId]) chatHistory[data.clientId].messages.push({ sender: 'admin', msg: data.msg });
        io.to(data.clientId).emit('receiveAdminMessage', { msg: data.msg });
    });
});

// --- AUTH API'LAR ---
app.post('/api/auth/register', async (req, res) => {
    try {
        if (await User.findOne({ phone: req.body.phone })) return res.status(400).json({ message: "Bu raqam band!" });
        const newUser = new User({ fullName: req.body.fullName, phone: req.body.phone, password: await bcrypt.hash(req.body.password, 10) });
        await newUser.save(); res.json({ token: jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET), fullName: newUser.fullName, phone: newUser.phone });
    } catch (err) { res.status(500).json({ message: "Xato" }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const user = await User.findOne({ phone: req.body.phone });
        if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(400).json({ message: "Xato ma'lumot!" });
        res.json({ token: jwt.sign({ userId: user._id }, process.env.JWT_SECRET), fullName: user.fullName, phone: user.phone });
    } catch (err) { res.status(500).json({ message: "Xato" }); }
});

app.post('/api/admin/login', (req, res) => {
    if (req.body.login === process.env.ADMIN_LOGIN && req.body.password === process.env.ADMIN_PASS) res.json({ token: jwt.sign({ role: 'admin' }, process.env.JWT_SECRET) });
    else res.status(401).json({ message: "Xato!" });
});

// --- MAHSULOT VA KATEGORIYALAR ---
app.get('/api/categories', async (req, res) => res.json(await Category.find()));
app.post('/api/categories', verifyAdmin, async (req, res) => { await new Category(req.body).save(); res.json({ message: "Qo'shildi!" }); });
app.delete('/api/categories/:id', verifyAdmin, async (req, res) => { await Category.findByIdAndDelete(req.params.id); res.json({ message: "O'chirildi!" }); });

app.get('/api/products', async (req, res) => res.json(await Product.find().sort({ _id: -1 })));

// YANGILANGAN: Rasmni Cloudinary dan olish
app.post('/api/products', verifyAdmin, upload.single('image'), async (req, res) => {
    try {
        const { name, category, price, oldPrice, description } = req.body; 
        const img = req.file ? req.file.path : ''; // req.file.path endi Cloudinary URL manzilini qaytaradi
        await new Product({ name, category, price: Number(price), oldPrice: oldPrice ? Number(oldPrice) : 0, description, img }).save(); 
        res.json({ message: "Qo'shildi!" });
    } catch (err) { res.status(500).json({ message: "Xatolik" }); }
});

app.delete('/api/products/:id', verifyAdmin, async (req, res) => { await Product.findByIdAndDelete(req.params.id); res.json({ message: "O'chirildi!" }); });
app.put('/api/products/:id/toggle-stock', verifyAdmin, async (req, res) => { const p = await Product.findById(req.params.id); p.inStock = !p.inStock; await p.save(); res.json({ message: "Holat o'zgardi" }); });

app.post('/api/products/:id/reviews', async (req, res) => {
    try { const p = await Product.findById(req.params.id); p.reviews.push({ author: req.body.author || 'Mijoz', text: req.body.text }); await p.save(); res.json(p); } catch (e) { res.status(500).json({ message: "Xato" }); }
});

app.put('/api/products/:id/reviews/:reviewId/reply', verifyAdmin, async (req, res) => {
    try {
        const p = await Product.findById(req.params.id); const review = p.reviews.id(req.params.reviewId);
        if(review) { review.adminReply = req.body.reply; await p.save(); } res.json({ message: "Javob yuborildi", product: p });
    } catch (e) { res.status(500).json({ message: "Xato" }); }
});

// --- BUYURTMALAR ---
app.get('/api/my-orders', verifyUser, async (req, res) => res.json(await Order.find({ userId: req.userId }).sort({ date: -1 })));

app.post('/api/order', async (req, res) => {
    try {
        const { cart, fullName, phone, location, deliveryMethod, totalSum } = req.body; let userId = null;
        try { userId = jwt.verify(req.headers['authorization'].split(' ')[1], process.env.JWT_SECRET).userId; } catch(e) {}
        
        await new Order({ userId, customerName: fullName, customerPhone: phone, location, deliveryMethod, totalSum, cart }).save();
        io.emit('newOrderAlert');

        let mainText = `🛍 **YANGI BUYURTMA!**\n\n👤 Mijoz: ${fullName}\n📞 Tel: ${phone}\n📦 Usul: ${deliveryMethod === 'pickup' ? "O'zi oladi" : "Yetkazish"}\n${deliveryMethod === 'delivery' ? `📍 Manzil: ${location}\n` : ''}\n💰 Jami: ${totalSum.toLocaleString()} so'm`;
        await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { chat_id: process.env.ADMIN_CHAT_ID, text: mainText, parse_mode: 'Markdown' });
        
        // YANGILANGAN: Rasmlarni URL orqali yuborish (Cloudinary rasmi)
        for (const item of cart) {
            if (item.img && item.img.startsWith('http')) {
                await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { 
                    chat_id: process.env.ADMIN_CHAT_ID, 
                    photo: item.img, 
                    caption: `🛒 ${item.name} (${item.quantity} ta)` 
                });
            }
        }
        res.json({ message: "Yuborildi!" });
    } catch (e) { res.status(500).json({ message: "Xato" }); }
});

app.get('/api/reports', verifyAdmin, async (req, res) => {
    const orders = await Order.find();
    res.json({ totalSum: orders.reduce((sum, o) => sum + o.totalSum, 0), orderCount: orders.length, userCount: await User.countDocuments() });
});

app.get('/api/admin/orders', verifyAdmin, async (req, res) => {
    try { res.json(await Order.find().sort({ date: -1 })); } catch(e) { res.status(500).json({ message: "Xato" }); }
});

app.put('/api/admin/orders/:id/status', verifyAdmin, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id); if(!order) return res.status(404).json({ message: "Topilmadi" });
        order.status = req.body.status; await order.save(); res.json({ message: "Status o'zgardi" });
    } catch(e) { res.status(500).json({ message: "Xato" }); }
});

server.listen(process.env.PORT || 3000, () => console.log(`Server ishlamoqda: 3000`));
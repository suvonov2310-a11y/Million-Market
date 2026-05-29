const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, default: 100 }, // Ombordagi qoldiq
    img: String,
});

module.exports = mongoose.model('Product', ProductSchema);
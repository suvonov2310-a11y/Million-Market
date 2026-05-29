const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    customerPhone: String,
    totalSum: Number,
    items: Array,
    paymentStatus: { 
        type: String, 
        enum: ['Kutilmoqda', 'To\'langan', 'Kartoteka', 'Inkasso'], 
        default: 'Kutilmoqda' 
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', OrderSchema);
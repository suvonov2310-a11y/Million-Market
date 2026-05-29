const express = require('express');
const router = express.Router();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const Product = require('../models/Product');
const Order = require('../models/Order');

// Mahsulotlarni olish
router.get('/products', async (req, res) => {
    res.json(await Product.find());
});

// Yangi Buyurtma qabul qilish va Botga rasm bilan yuborish
router.post('/order', async (req, res) => {
    const { cart, fullName, phone, location, deliveryMethod, totalSum } = req.body;

    if (!cart || cart.length === 0) return res.status(400).json({ message: "Savatcha bo'sh!" });

    // 1. Bazaga yozish (Moliya uchun)
    await new Order({ customerPhone: phone, totalSum, items: cart }).save();

    // 2. Telegram bot uchun Asosiy xabarni tayyorlash
    const methodText = deliveryMethod === 'pickup' ? "🏃‍♂️ O'zi olib ketadi" : "🚚 Yetkazib berish";
    let mainText = `🛍 **YANGI BUYURTMA!**\n\n`;
    mainText += `👤 **Mijoz:** ${fullName}\n`;
    mainText += `📞 **Tel:** ${phone}\n`;
    mainText += `📦 **Tur:** ${methodText}\n`;
    if (deliveryMethod === 'delivery') {
        mainText += `📍 **Manzil:** ${location}\n`;
    }
    mainText += `\n💰 **Jami summa:** ${totalSum.toLocaleString()} so'm`;

    try {
        // Avval asosiy ma'lumotni jo'natamiz
        await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: process.env.ADMIN_CHAT_ID,
            text: mainText,
            parse_mode: 'Markdown'
        });

        // Endi savatchadagi har bir mahsulotni rasmi bilan jo'natamiz
        for (const item of cart) {
            const itemCaption = `🛒 **${item.name}**\n🔢 Soni: ${item.quantity} ta\n💵 Narxi: ${item.price.toLocaleString()} so'm`;

            // Agar rasm bizning serverda (kompyuterda) saqlangan bo'lsa
            if (item.img && item.img.startsWith('/uploads/')) {
                // Rasmni joylashgan papkasini topamiz
                const imagePath = path.join(__dirname, '..', 'public', item.img);
                
                if (fs.existsSync(imagePath)) {
                    const form = new FormData();
                    form.append('chat_id', process.env.ADMIN_CHAT_ID);
                    form.append('photo', fs.createReadStream(imagePath));
                    form.append('caption', itemCaption);
                    form.append('parse_mode', 'Markdown');

                    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, form, {
                        headers: form.getHeaders()
                    });
                }
            } 
            // Agar rasm internetdan olingan (http silka) bo'lsa
            else if (item.img && item.img.startsWith('http')) {
                await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                    chat_id: process.env.ADMIN_CHAT_ID,
                    photo: item.img,
                    caption: itemCaption,
                    parse_mode: 'Markdown'
                });
            }
        }

        res.json({ message: "Buyurtma muvaffaqiyatli yuborildi!" });
    } catch (error) {
        console.error("Telegram bot xatosi:", error.message);
        res.status(500).json({ message: "Xatolik yuz berdi" });
    }
});

module.exports = router;
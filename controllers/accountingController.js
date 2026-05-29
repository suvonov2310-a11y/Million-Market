const Order = require('../models/Order');

// Vznos nalichnymi v bank (Naqd pulni bankka kirim qilish)
exports.processCashDeposit = async (req, res) => {
    try {
        const { amount, responsiblePerson } = req.body;
        
        // Barcha "To'langan" lekin hali bankka topshirilmagan buyurtmalarni yig'ish
        const recentOrders = await Order.find({ paymentStatus: 'To\'langan' });
        const totalCashInRegister = recentOrders.reduce((sum, order) => sum + order.totalSum, 0);

        if (amount > totalCashInRegister) {
            return res.status(400).json({ message: "Kassada buncha naqd pul yo'q. Qoldiq: " + totalCashInRegister });
        }

        // Tranzaksiyani bazaga yozish mantiqi (simulyatsiya)
        res.json({ 
            message: `Muvaffaqiyatli: ${amount} so'm bankka kirim qilindi.`,
            document: `KKO-123 (Kirim kassa orderi), Mas'ul: ${responsiblePerson}`
        });
    } catch (error) {
        res.status(500).json({ message: "Buxgalteriya tizimida xatolik yuz berdi." });
    }
};

exports.getDebts = async (req, res) => {
    try {
        // Kartoteka holatidagi muammoli to'lovlarni izlash
        const debts = await Order.find({ paymentStatus: 'Kartoteka' });
        res.json(debts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
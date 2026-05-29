const axios = require('axios');

exports.askZiya = async (req, res) => {
    const userMessage = req.body.message;
    const systemPrompt = "Sen 'Ziya' ismli qat'iy va aqlli do'kon yordamchisisan. Mijozlarga qisqa va aniq javob berasan.";

    try {
        // 1-urinish: Gemini API
        const geminiResponse = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nMijoz: ${userMessage}` }] }]
            }
        );
        return res.json({ reply: geminiResponse.data.candidates[0].content.parts[0].text, source: 'Gemini' });

    } catch (geminiError) {
        console.log("Gemini xizmatida xatolik, DeepSeek ga o'tilmoqda...");
        
        try {
            // Failover: DeepSeek API
            const deepseekResponse = await axios.post(
                'https://api.deepseek.com/v1/chat/completions',
                {
                    model: "deepseek-chat",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userMessage }
                    ]
                },
                { headers: { 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}` } }
            );
            return res.json({ reply: deepseekResponse.data.choices[0].message.content, source: 'DeepSeek' });

        } catch (deepseekError) {
            return res.status(500).json({ reply: "Hozircha AI tizimlari band. Birozdan so'ng urinib ko'ring." });
        }
    }
};
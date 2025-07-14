// DEĞİŞİKLİK: Tüm 'require' ifadeleri 'import' ile değiştirildi
import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import crypto from 'crypto';
import 'dotenv/config'; // dotenv'in yeni kullanım şekli
import { JSONFilePreset } from 'lowdb/node';

// --- Veritabanı Kurulumu ---
const defaultData = { nonces: {} };
const db = await JSONFilePreset('db.json', defaultData);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const privateKey = process.env.BACKEND_SIGNER_PRIVATE_KEY;

if (!privateKey) {
    throw new Error("BACKEND_SIGNER_PRIVATE_KEY is not set in .env file");
}
const signer = new ethers.Wallet(privateKey);

const symbols = ['🍒', '🍋', '💎', '🔔', '💰', '⭐'];
const payouts = {
    '🍒🍒🍒': 5,
    '🍋🍋🍋': 10,
    '💎💎💎': 15,
    '🔔🔔🔔': 25,
    '💰💰💰': 50,
    '⭐⭐⭐': 100,
};
const winningCombinations = Object.keys(payouts);

const countSymbols = (reels, symbol) => reels.filter(s => s === symbol).length;

app.post('/spin', async (req, res) => {
    const { playerAddress, betAmount } = req.body;
    if (!ethers.isAddress(playerAddress) || !betAmount || parseFloat(betAmount) <= 0) {
        return res.status(400).json({ error: 'Invalid player address or bet amount' });
    }

    let finalReels = [];
    let multiplier = 0;
    const isOverallWin = crypto.randomInt(1, 101) <= 40;

    if (isOverallWin) {
        const winType = crypto.randomInt(1, 101);
        if (winType <= 70) {
            multiplier = 2;
            const nonCherrySymbols = symbols.filter(s => s !== '🍒');
            const otherSymbol = nonCherrySymbols[crypto.randomInt(0, nonCherrySymbols.length)];
            const cherryPositions = [0, 1, 2].sort(() => 0.5 - Math.random()).slice(0, 2);
            finalReels = [null, null, null];
            cherryPositions.forEach(p => finalReels[p] = '🍒');
            finalReels[finalReels.indexOf(null)] = otherSymbol;
        } else {
            const randomWinningKey = winningCombinations[crypto.randomInt(0, winningCombinations.length)];
            multiplier = payouts[randomWinningKey];
            const symbol = randomWinningKey.charAt(0);
            finalReels = [symbol, symbol, symbol];
        }
    } else {
        let isWinningOrTwoCherries = true;
        do {
            finalReels = symbols.map(() => symbols[crypto.randomInt(0, symbols.length)]);
            const resultKey = finalReels.join('');
            const cherryCount = countSymbols(finalReels, '🍒');
            isWinningOrTwoCherries = payouts.hasOwnProperty(resultKey) || cherryCount === 2;
        } while (isWinningOrTwoCherries);
        multiplier = 0;
    }

    const currentNonce = db.data.nonces[playerAddress] || 0;
    const newNonce = currentNonce + 1;
    const betAmountInWei = ethers.parseEther(betAmount.toString());
    const prizeInWei = betAmountInWei * BigInt(multiplier);

    let signature = null;
    if (prizeInWei > 0) {
        const messageHash = ethers.solidityPackedKeccak256(
            ["address", "uint256", "uint256"],
            [playerAddress, prizeInWei, newNonce]
        );
        const signedMessage = await signer.signMessage(ethers.getBytes(messageHash));
        signature = signedMessage;

        db.data.nonces[playerAddress] = newNonce;
        await db.write();
    }
    
    const finalIndices = finalReels.map(symbol => symbols.indexOf(symbol));

    res.json({
        reels: finalReels,
        indices: finalIndices,
        prizeAmount: ethers.formatEther(prizeInWei),
        nonce: newNonce,
        signature,
    });
});

app.listen(PORT, () => {
    console.log(`[BACKEND SERVER] İmza için kullanılan backend adresi: ${signer.address}`);
    console.log(`Slot machine backend listening on port ${PORT}`);
});
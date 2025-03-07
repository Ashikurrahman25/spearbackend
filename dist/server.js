"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const app = (0, express_1.default)();
const cors_1 = __importDefault(require("cors"));
const nearAPI = __importStar(require("near-api-js"));
const near_api_js_1 = require("near-api-js");
const { keyStores } = nearAPI;
const { Contract } = nearAPI;
const myKeyStore = new keyStores.InMemoryKeyStore();
const crypto = __importStar(require("crypto"));
const passphrase = process.env.PASS_PHRASE;
const salt = process.env.SALT;
const keyLength = 32;
const iterations = 100000;
const digest = 'sha256';
const private_key = process.env.PRIVATE_KEY;
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use((0, cors_1.default)({
    origin: [
        'https://spearonnear.github.io/SpearHit',
        'https://ashikurrahman25.github.io',
        'https://spearonnear.github.io',
    ],
}));
const { connect } = nearAPI;
const mainConfig = {
    keyStore: myKeyStore,
    networkId: 'mainnet',
    nodeUrl: 'https://rpc.mainnet.near.org',
    walletUrl: 'https://wallet.mainnet.near.org',
    helperUrl: 'https://helper.mainnet.near.org',
    explorerUrl: 'https://nearblocks.io',
};
let contract;
let account;
const decimals = {
    'spear-1565.meme-cooking.near': {
        contract: 'spear-1565.meme-cooking.near',
        decimals: 18,
    },
    'blackdragon.tkn.near': {
        contract: 'blackdragon.tkn.near',
        decimals: 24,
    },
};
const setup = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Setting up...');
        if (!private_key)
            throw new Error('PRIVATE_KEY is missing in the environment variables');
        const PRIVATE_KEY = decodePrivateKey(private_key);
        const keyPair = near_api_js_1.KeyPair.fromString(PRIVATE_KEY);
        yield myKeyStore.setKey('mainnet', 'speargames.near', keyPair);
        const near = yield connect(mainConfig);
        account = yield near.account('speargames.near');
        contract = new Contract(account, 'speargames.near', {
            viewMethods: ['ft_balance_of'],
            changeMethods: ['ft_transfer', 'send_ft_to_user'],
            useLocalViewExecution: true,
        });
        console.log('Setup Complete');
    }
    catch (error) {
        console.error('Setup failed:', error);
    }
});
setup();
app.post('/send', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { receiver_id, amount, memo, tkn } = req.body;
        if (!receiver_id || !amount || !tkn) {
            return res.status(400).json({ error: 'Missing "receiver_id", "amount", or "tkn" in the request body.' });
        }
        if (!decimals[tkn]) {
            return res.status(400).json({ error: `Token "${tkn}" not found in decimals mapping.` });
        }
        const tokenDecimals = decimals[tkn].decimals;
        const amountConverted = BigInt(parseFloat(amount) * Math.pow(10, tokenDecimals)).toString();
        console.log(`Converted Amount: ${amountConverted}`);
        const functionCallResult = yield account.functionCall({
            contractId: tkn,
            methodName: 'ft_transfer',
            args: {
                receiver_id,
                amount: amountConverted,
                memo,
            },
            attachedDeposit: BigInt(1), // Small deposit for FT transfers
        });
        const gasUsed = BigInt(functionCallResult.transaction_outcome.outcome.gas_burnt);
        const gasFeeYoctoNEAR = parseFloat(gasUsed.toString()) * 1e-12;
        let totalTokensBurnt = BigInt(functionCallResult.transaction_outcome.outcome.tokens_burnt);
        functionCallResult.receipts_outcome.forEach((outcome) => {
            totalTokensBurnt += BigInt(outcome.outcome.tokens_burnt);
        });
        const transactionFeeNEAR = parseFloat(totalTokensBurnt.toString()) / Math.pow(10, 24);
        let status = 'success';
        let exception = '';
        function isFailureStatus(status) {
            return status && typeof status === 'object' && 'Failure' in status;
        }
        if (functionCallResult.receipts_outcome) {
            functionCallResult.receipts_outcome.forEach((outcome) => {
                const outcomeStatus = outcome.outcome.status;
                if (isFailureStatus(outcomeStatus)) {
                    status = 'error';
                    exception = outcomeStatus.Failure.error_message || JSON.stringify(outcomeStatus.Failure);
                    console.error('Detailed error info:', outcomeStatus.Failure);
                }
            });
        }
        const result = {
            success: status === 'success',
            message: status === 'success' ? `Successfully sent ${tkn} tokens!` : exception,
            txnLink: functionCallResult.transaction_outcome.id,
            gasUsed: functionCallResult.transaction_outcome.outcome.gas_burnt.toString(),
            gasFee: gasFeeYoctoNEAR.toFixed(8),
            transactionFee: transactionFeeNEAR.toFixed(8),
        };
        res.json(result);
    }
    catch (error) {
        console.error('Error processing transaction:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}));
function deriveKey() {
    if (!passphrase || !salt) {
        throw new Error('Passphrase or salt is missing from environment variables');
    }
    return crypto.pbkdf2Sync(passphrase, salt, iterations, keyLength, digest);
}
function decodePrivateKey(encryptedData) {
    try {
        const [ivHex, encrypted, authTagHex] = encryptedData.split(':');
        if (!ivHex || !encrypted || !authTagHex) {
            throw new Error('Invalid format: Missing IV, encrypted data, or auth tag');
        }
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const key = deriveKey();
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (error) {
        console.error('Error during decryption:', error.message);
        throw new Error('Failed to decode the key. Ensure the format is correct and passphrase/salt are consistent.');
    }
}
const port = process.env.PORT || 9000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

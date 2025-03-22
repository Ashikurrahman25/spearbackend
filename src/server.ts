import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
const app = express();
import cors from 'cors';
import * as nearAPI from 'near-api-js';
import { KeyPair, utils } from 'near-api-js';
const { keyStores } = nearAPI;
const { Contract } = nearAPI;
const myKeyStore = new keyStores.InMemoryKeyStore();
import * as crypto from 'crypto';

const passphrase = process.env.PASS_PHRASE;
const salt = process.env.SALT;
const keyLength = 32;
const iterations = 100000;
const digest = 'sha256';
const private_key = process.env.PRIVATE_KEY;

app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(
  cors({
    origin: [
      'https://spearonnear.github.io/SpearHit',
      'https://ashikurrahman25.github.io',
      'https://spearonnear.github.io',
      'https://game.spearonnear.com',
      'https://game.spearonnear.com/'
    ],
  })
);

const { connect } = nearAPI;

const mainConfig = {
  keyStore: myKeyStore,
  networkId: 'mainnet',
  nodeUrl: 'https://rpc.mainnet.near.org',
  walletUrl: 'https://wallet.mainnet.near.org',
  helperUrl: 'https://helper.mainnet.near.org',
  explorerUrl: 'https://nearblocks.io',
};

let contract: nearAPI.Contract;
let account: nearAPI.Account;

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

const setup = async () => {
  try {
    console.log('Setting up...');
    if (!private_key) throw new Error('PRIVATE_KEY is missing in the environment variables');
    const PRIVATE_KEY = decodePrivateKey(private_key);
    const keyPair = KeyPair.fromString(PRIVATE_KEY);
    await myKeyStore.setKey('mainnet', 'speargames.near', keyPair);

    const near = await connect(mainConfig);
    account = await near.account('speargames.near');

    contract = new Contract(account, 'speargames.near', {
      viewMethods: ['ft_balance_of'],
      changeMethods: ['ft_transfer', 'send_ft_to_user'],
      useLocalViewExecution: true,
    });

    console.log('Setup Complete');
  } catch (error) {
    console.error('Setup failed:', error);
  }
};

setup();

app.post('/send', async (req, res) => {
  try {
    const { receiver_id, amount, memo, tkn } = req.body;
    if (!receiver_id || !amount || !tkn) {
      return res.status(400).json({ error: 'Missing "receiver_id", "amount", or "tkn" in the request body.' });
    }

    if (!decimals[tkn as keyof typeof decimals]) {
      return res.status(400).json({ error: `Token "${tkn}" not found in decimals mapping.` });
    }
    
    const tokenDecimals = decimals[tkn as keyof typeof decimals].decimals;
    
    const amountConverted = BigInt(parseFloat(amount) * Math.pow(10, tokenDecimals)).toString();
    console.log(`Converted Amount: ${amountConverted}`);

    const functionCallResult = await account.functionCall({
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

    function isFailureStatus(status: any): status is { Failure: any } {
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
  } catch (error: any) {
    console.error('Error processing transaction:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

function deriveKey(): Buffer {
  if (!passphrase || !salt) {
    throw new Error('Passphrase or salt is missing from environment variables');
  }
  return crypto.pbkdf2Sync(passphrase, salt, iterations, keyLength, digest);
}

function decodePrivateKey(encryptedData: string): string {
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
  } catch (error: any) {
    console.error('Error during decryption:', error.message);
    throw new Error('Failed to decode the key. Ensure the format is correct and passphrase/salt are consistent.');
  }
}

const port = process.env.PORT || 9000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

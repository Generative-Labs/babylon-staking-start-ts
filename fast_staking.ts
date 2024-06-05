import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { Psbt, initEccLib } from "bitcoinjs-lib";
import { WalletInfo } from './types/walletInfo';
import { logger } from './utils/logger';
import { HDWallet } from './utils/wallet/hd_wallet';
import { buildStakingPsbt } from './utils/babylon';
import { getGlobalParams } from './utils/babylonApi';
import { signetNetwork } from './utils/network';
import { toXOnly } from './utils/btc';
import * as tinysecp from 'tiny-secp256k1'
import { GlobalParamsVersion } from './utils/buildScriptApi';
import { getTipHeight, pushTx } from './utils/mempoolApi';

dotenv.config();
initEccLib(tinysecp)


const buildedTxPath = "txs.txt"
const activationHeight = process.env.BABYLON_ACTIVATION_HEIGHT ? parseInt(process.env.BABYLON_ACTIVATION_HEIGHT) : 0

if (!activationHeight) {
    throw new Error("Undefined activation height")
}

async function waitToHeight(height: number) {
    let currentGlobalParam: GlobalParamsVersion;
    while (true) {

        let networkTipHeight
        try {
            networkTipHeight = await getTipHeight();
        } catch (e: any) {
            console.log(`Get tip height error: ${e.message}`)
            await new Promise(resolve => setTimeout(resolve, 1000))
            continue
        }
        if (networkTipHeight >= height) {
            break
        }
        console.log(`Expect height: ${height}, Network tip height: ${networkTipHeight}, Waiting for activation height...`)
        await new Promise(resolve => setTimeout(resolve, 1000))
    }

    return currentGlobalParam
}

async function main() {
    let signedTxs: string[] = [];
    try {

        const data = fs.readFileSync(buildedTxPath, 'utf-8')
        signedTxs = data.split('\n').filter(tx => tx.trim() !== '')
    } catch (e: any) {
        console.log(`Read ${buildedTxPath} error: ${e.message}`)
        return
    }

    // wait for activation height
    await waitToHeight(activationHeight);

    const pushTxPromises = signedTxs.map(signedTx => {
        return (async () => {
            while (true) {
                try {
                    const txid = await pushTx(signedTx);
                    console.log(`[${txid}] broadcast ${signedTx} success`);
                    return txid;
                } catch (e) {
                    console.log(`Broadcast transaction ${signedTx} failed, retry...`);
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }
        })();
    });

    await Promise.all(pushTxPromises)
}

main().then(() => { })

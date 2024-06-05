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


const txidPath = "txid.txt"
const walletPath = "wallets.json"
const activationHeight = process.env.BABYLON_ACTIVATION_HEIGHT ? parseInt(process.env.BABYLON_ACTIVATION_HEIGHT) : 0
const finalityProvider = 'f4940b238dcd00535fde9730345bab6ff4ea6d413cc3602c4033c10f251c7e81'

if (!activationHeight) {
    throw new Error("Undefined activation height")
}

async function waitToActivationHeight(activationHeight: number) {
    let currentGlobalParam: GlobalParamsVersion;
    while (true) {
        const globalParams = await getGlobalParams()

        // get max activation height
        const tipHeight = globalParams.reduce((max, param) => Math.max(max, param.activationHeight), 0)
        if (tipHeight != activationHeight) {
            console.error(`Current tip height: ${tipHeight}, Waiting for activation height: ${activationHeight}...`)
            break
        }

        let networkTipHeight
        try {
            networkTipHeight = await getTipHeight();
        } catch (e: any) {
            console.log(`Get tip height error: ${e.message}`)
            await new Promise(resolve => setTimeout(resolve, 200))
            continue
        }

        if (networkTipHeight < tipHeight) {
            console.log(`Babylon tip height: ${tipHeight}, Network tip height: ${networkTipHeight}, Waiting for activation height...`)
            await new Promise(resolve => setTimeout(resolve, 1000))
            continue
        }

        const currentHeights = globalParams.map(param => param.activationHeight)
        currentGlobalParam = globalParams.find(param => param.activationHeight === activationHeight)
        if (currentGlobalParam) {
            break
        }
        console.log(`Current heights: ${currentHeights}, Waiting for activation height: ${activationHeight}...`)
    }

    console.log(`Activation height reached: ${activationHeight}`)
    return currentGlobalParam
}

async function main() {
    // wait for activation height
    const currentGlobalParam = await waitToActivationHeight(activationHeight)
    if (!currentGlobalParam) {
        throw Error(`Undefined current global param`)
    }

    const startTime = new Date().getTime();
    // read wallet path
    const walletContent = fs.readFileSync(walletPath)
    let wallets: WalletInfo[];

    try {
        wallets = JSON.parse(walletContent.toString())
    } catch (error: any) {
        logger.error(error)
        return
    }

    const hdWalletProviders = wallets.map(wallet => new HDWallet(wallet.taprootAddressMaster, wallet.wifMaster))

    try {
        for (let wallet of hdWalletProviders) {
            await wallet.connectWallet()
        }
    } catch (error: any) {
        console.log(error)
        return
    }

    // sign per psbt
    // let signedTxs: string[] = [];
    // try {
    //     for (let i = 0; i < hdWalletProviders.length; i++) {
    //         const wallet = hdWalletProviders[i];
    //         const address = await wallet.getAddress();
    //         const publicKey = await wallet.getPublicKeyHex();
    //         let unsignedStakingPsbt = await buildStakingPsbt(
    //             currentGlobalParam,
    //             wallet,
    //             finalityProvider,
    //             currentGlobalParam.minStakingTimeBlocks,
    //             signetNetwork,
    //             currentGlobalParam.maxStakingAmountSat - 50000,
    //             address,
    //             toXOnly(Buffer.from(publicKey, 'hex')).toString('hex'),
    //             20,
    //         );

    //         const signedTx = await wallet.signPsbt(unsignedStakingPsbt);
    //         signedTxs.push(signedTx)
    //         console.log(signedTx)
    //     }
    // } catch (error: any) {
    //     console.log(error)
    //     return
    // }

    const signTxPromises = hdWalletProviders.map(async (wallet, i) => {
        const address = await wallet.getAddress();
        const publicKey = await wallet.getPublicKeyHex();
        let unsignedStakingPsbt;
        while (true) {
            try {
                unsignedStakingPsbt = await buildStakingPsbt(
                    currentGlobalParam,
                    wallet,
                    finalityProvider,
                    currentGlobalParam.minStakingTimeBlocks,
                    signetNetwork,
                    currentGlobalParam.maxStakingAmountSat - 50000,
                    address,
                    toXOnly(Buffer.from(publicKey, 'hex')).toString('hex'),
                    20,
                );

                break
            } catch (e: any) {
                console.log(`Build ${i} transaction error: ${e.message} retry`)
                await new Promise(resolve => setTimeout(resolve, 1000))
                continue
            }
        }

        const signedTx = await wallet.signPsbt(unsignedStakingPsbt);
        return signedTx
    })

    const signedTxs = await Promise.all(signTxPromises);

    const endTime = new Date().getTime();
    console.log(`Build tranasctions executed in ${endTime - startTime} milliseconds.`);

    const pushTxPromises = signedTxs.map(signedTx => {
        return (async () => {
            while (true) {
                try {
                    const txid = await pushTx(signedTx);
                    console.log(`[${txid}] broadcast ${signedTx} success`);
                    return txid;
                } catch (e) {
                    console.log(`Broadcast transaction ${signedTx} failed, retry...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
        })();
    });

    const txid = await Promise.all(pushTxPromises)
    try {
        fs.writeFileSync(txidPath, txid.join('\n'), { flag: 'w' })
    } catch (e: any) {
        console.log(`Write txs to ${txidPath} error: ${e.message}`)
    }
}

main().then(() => { })

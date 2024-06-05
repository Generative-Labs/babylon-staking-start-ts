import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { initEccLib } from "bitcoinjs-lib";
import { WalletInfo } from './types/walletInfo';
import { logger } from './utils/logger';
import { HDWallet } from './utils/wallet/hd_wallet';
import { buildStakingPsbt } from './utils/babylon';
import { getGlobalParams } from './utils/babylonApi';
import { signetNetwork } from './utils/network';
import { toXOnly } from './utils/btc';
import * as tinysecp from 'tiny-secp256k1'

dotenv.config();
initEccLib(tinysecp)


const walletPath = "wallets.json"
const buildedTxPath = "txs.txt"
const activationHeight = process.env.BABYLON_ACTIVATION_HEIGHT ? parseInt(process.env.BABYLON_ACTIVATION_HEIGHT) : 0
const finalityProvider = 'f4940b238dcd00535fde9730345bab6ff4ea6d413cc3602c4033c10f251c7e81'

if (!activationHeight) {
    throw new Error("Undefined activation height")
}



async function main() {
    let globalParams;
    try {
        globalParams = await getGlobalParams()
    } catch (e: any) {
        console.log(`Get babylon global params error: ${e.message}`)
        return
    }

    // wait for activation height
    const currentGlobalParam = globalParams.find(param => param.activationHeight === activationHeight)
    if (!currentGlobalParam) {
        throw Error(`Undefined current global param`)
    }

    console.log(currentGlobalParam)

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

    // write to file
    try {
        fs.writeFileSync(buildedTxPath, signedTxs.join('\n'), { flag: 'w' })
    } catch (e: any) {
        console.log(`Write txs to ${buildedTxPath} error: ${e.message}`)

    }
}

main().then(() => { })

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
import { pushTx } from './utils/mempoolApi';

dotenv.config();
initEccLib(tinysecp)


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
        const currentHeights = globalParams.map(param => param.activationHeight)
        currentGlobalParam = globalParams.find(param => param.activationHeight === activationHeight)
        if (currentGlobalParam) {
            break
        }
        console.log(`Current heights: ${currentHeights}, Waiting for activation height: ${activationHeight}...`)
        await new Promise(resolve => setTimeout(resolve, 1000))
    }

    console.log(`Activation height reached: ${activationHeight}`)
    return currentGlobalParam
}

async function main() {
    // wait for activation height
    const currentGlobalParam = await waitToActivationHeight(activationHeight)

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

    let unsignedStakingPsbts: Psbt[] = []
    try {
        for (let wallet of hdWalletProviders) {
            const address = await wallet.getAddress();
            const publicKey = await wallet.getPublicKeyHex();
            let unsignedStakingPsbt = await buildStakingPsbt(
                currentGlobalParam,
                wallet,
                finalityProvider,
                currentGlobalParam.minStakingTimeBlocks,
                signetNetwork,
                currentGlobalParam.maxStakingAmountSat,
                address,
                toXOnly(Buffer.from(publicKey, 'hex')).toString('hex')
            );

            unsignedStakingPsbts.push(unsignedStakingPsbt)
        }
    } catch (error: any) {
        console.log(error)
        return
    }

    // sign per psbt
    try {
        for (let i = 0; i < hdWalletProviders.length; i++) {
            const wallet = hdWalletProviders[i];
            const psbt = unsignedStakingPsbts[i];
            const signedTx = await wallet.signPsbt(psbt);

            const txid = await pushTx(signedTx)
            console.log(`Transaction ${txid} broadcast`)
        }
    } catch (error: any) {
        console.log(error)
        return
    }
}

main().then(() => { })

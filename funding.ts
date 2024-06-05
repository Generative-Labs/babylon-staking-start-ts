import { logger } from './utils/logger';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import ECPairFactory, { ECPairInterface } from 'ecpair';
import { Transaction, Psbt, payments, initEccLib } from "bitcoinjs-lib";
import { WalletInfo } from './types/walletInfo';
import { GlobalParamsVersion, getGlobalParams } from './utils/babylonApi';
import { signetNetwork } from './utils/network';
import { estimatedFee, isTaproot, toXOnly, tweakSigner } from './utils/btc';
import { UTXO, getFundingUTXOs, pushTx } from './utils/mempoolApi';
import { isTaprootOutput } from 'bitcoinjs-lib/src/psbt/bip371';
import * as tinysecp from 'tiny-secp256k1'

dotenv.config();
initEccLib(tinysecp);

const ECPair = ECPairFactory(tinysecp);
const network = signetNetwork
const walletPath = "wallets.json"
const activationHeight = process.env.BABYLON_ACTIVATION_HEIGHT ? parseInt(process.env.BABYLON_ACTIVATION_HEIGHT) : 0
const fundingAmountSats = 5000000 - 300;


if (!activationHeight) {
    throw new Error("Undefined activation height")
}

async function buildBatchTransaction(
    bankAddress: string,
    bankKeypair: ECPairInterface,
    requests: {
        address: string,
        value: number
    }[], feeRate: number): Promise<Transaction> {
    if (!isTaproot(bankAddress)) {
        logger.error(`not a taproot address`)
        throw new Error("Not a taproot address")
    }
    const bankPublicKey = bankKeypair.publicKey

    const requestAmountSum = requests.reduce((total, request) => total + request.value, 0);
    const fee = estimatedFee(feeRate, 1 /*input */, requests.length, /*output */)
    const totalAmount = Math.ceil(requestAmountSum + fee);

    let psbt = new Psbt({ network })

    const tapInternalKey = toXOnly(bankPublicKey)
    const p2pktr = payments.p2tr({
        internalPubkey: tapInternalKey,
        network
    });


    logger.info(`estiamted fee: ${fee}`)
    logger.info(`request amount sum: ${requestAmountSum}`)
    logger.info(`total amount sum: ${totalAmount}`)

    let inputs: UTXO[];
    try {
        inputs = await getFundingUTXOs(bankAddress, totalAmount)
    } catch (e: any) {
        logger.error(`faucet insufficent`)
        throw new Error("Insufficient funds")
    }

    if (inputs.length === 0) {
        throw new Error("Insufficient funds")
    }

    let inputSum = 0;
    for (let index = 0; index < inputs.length; index++) {
        const input = inputs[index];
        logger.info(`input: ${input.txid} ${input.vout} ${input.value} ${input.scriptPubKey}`)

        psbt.addInput({
            hash: input.txid,
            index: input.vout,
            witnessUtxo: {
                script: p2pktr.output!,
                value: input.value,
            },
            tapInternalKey: tapInternalKey,
        })
        inputSum += input.value
    }

    for (let index = 0; index < requests.length; index++) {
        const request = requests[index];
        try {
            psbt.addOutput({
                address: request.address,
                value: request.value
            })
        } catch (e) {
            logger.info(`${request.address}: ${e.message}`)
        }

    }

    const { address: sendAddress } = payments.p2tr({
        internalPubkey: tapInternalKey,
        network,
    });

    psbt.addOutput({
        address: sendAddress!,
        value: inputSum - totalAmount,
        tapInternalKey: tapInternalKey
    })


    for (let index = 0; index < inputs.length; index++) {
        // const input = inputs[index];
        if (isTaprootOutput(psbt.data.inputs[index])) {
            const signer = tweakSigner(bankKeypair, { network });
            psbt.signInput(index, signer);
        } else {
            const signer = bankKeypair;
            psbt.signInput(index, signer);
        }
    }

    psbt.finalizeAllInputs();

    let tx: Transaction
    try {
        tx = psbt.extractTransaction()
    } catch (e: any) {
        logger.error(`extract transaction error ${e}`)
        throw new Error("Extract transaction error")
    }
    return tx
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
    let privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Undefined faucet private key")
    }


    let address = process.env.ADDRESS;
    if (!address) {
        throw new Error("Undefined faucet address")
    }

    const bankKeypair = ECPair.fromWIF(privateKey, signetNetwork)
    const bankAddress = address;

    // const currentGlobalParam = waitToActivationHeight(activationHeight)
    // if (!currentGlobalParam) {
    //     logger.error("No global params found for the current activation height")
    //     return
    // }

    // read wallet path
    const walletContent = fs.readFileSync(walletPath)
    let wallets: WalletInfo[];

    try {
        wallets = JSON.parse(walletContent.toString())
    } catch (error: any) {
        logger.error(error)
        return
    }

    const requests = wallets.map(wallet => {
        return {
            address: wallet.taprootAddressMaster,
            value: fundingAmountSats
        }
    })

    let fundingTx: Transaction;
    try {
        fundingTx = await buildBatchTransaction(bankAddress, bankKeypair, requests, 1.5)
    } catch (e) {
        console.error(e)
        return
    }

    let fundingTxHex = fundingTx.toHex()

    console.log(`funding txHex: ${fundingTxHex}`)
}

main().then(() => { })

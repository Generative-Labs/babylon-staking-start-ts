import * as bitcoin from 'bitcoinjs-lib'
import { witnessStackToScriptWitness } from './witnessStackToScriptWitness';
import { logger } from './logger';
import * as tinysecp from 'tiny-secp256k1'
import ECPairFactory from 'ecpair';

const taprootAddressLength = 62;
const ECPair = ECPairFactory(tinysecp);
export const isTaproot = (address: string): boolean => {
    return address.length === taprootAddressLength;
};

export const toXOnly = (pubKey: Buffer) => pubKey.subarray(1, 33);

export const getPublicKeyNoCoord = (pkHex: string): Buffer => {
    const publicKey = Buffer.from(pkHex, "hex");
    return publicKey.subarray(1, 33);
};

// internalPubkey denotes an unspendable internal public key to be used for the taproot output
const key =
    "0250929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0";
export const internalPubkey = Buffer.from(key, "hex").subarray(1, 33); // Do a subarray(1, 33) to get the public coordinate


export const getFinalScripts = (inputIndex: any, input: any, script: any) => {
    const scriptSolution = [
        bitcoin.opcodes.OP_1,
        input.tapScriptSig[0].signature,
    ];
    logger.info(`input.tapScriptSig: ${input.tapScriptSig}`)

    return {
        finalScriptWitness: witnessStackToScriptWitness(scriptSolution)
    }
}

function tapTweakHash(pubKey: Buffer, h: Buffer | undefined): Buffer {
    return bitcoin.crypto.taggedHash(
        "TapTweak",
        Buffer.concat(h ? [pubKey, h] : [pubKey])
    );
}

export function tweakSigner(signer: bitcoin.Signer, opts: any = {}): bitcoin.Signer {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    let privateKey: Uint8Array | undefined = signer.privateKey!;
    if (!privateKey) {
        throw new Error("Private key is required for tweaking signer!");
    }
    if (signer.publicKey[0] === 3) {
        privateKey = tinysecp.privateNegate(privateKey);
    }

    const tweakedPrivateKey = tinysecp.privateAdd(
        privateKey,
        bitcoin.crypto.taggedHash(
            "TapTweak",
            toXOnly(signer.publicKey),
        ),
    );
    if (!tweakedPrivateKey) {
        throw new Error("Invalid tweaked private key!");
    }

    return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
        network: opts.network,
    });
}


// Estimated size of a transaction input in bytes for fee calculation purpose only
export const INPUT_SIZE_FOR_FEE_CAL = 180;

// Estimated size of a transaction output in bytes for fee calculation purpose only
export const OUTPUT_SIZE_FOR_FEE_CAL = 34;

// Buffer size for a transaction in bytes for fee calculation purpose only
export const TX_BUFFER_SIZE_FOR_FEE_CAL = 10;

// Estimated size of an OP_RETURN output in bytes for fee calculation purpose only
export const ESTIMATED_OP_RETURN_SIZE = 40;

/**
 * Calculates the estimated transaction fee using a heuristic formula.
 *
 * This method estimates the transaction fee based on the formula:
 * `numInputs * 180 + numOutputs * 34 + 10 + numInputs`
 *
 * The formula provides an overestimated transaction size to ensure sufficient fees:
 * - Each input is approximated to 180 bytes.
 * - Each output is approximated to 34 bytes.
 * - Adds 10 bytes as a buffer for the transaction.
 * - Adds 40 bytes for an OP_RETURN output.
 * - Adds the number of inputs to account for additional overhead.
 *
 * @param feeRate - The fee rate in satoshis per byte.
 * @param numInputs - The number of inputs in the transaction.
 * @param numOutputs - The number of outputs in the transaction.
 * @returns The estimated transaction fee in satoshis.
 */
export const estimatedFee = (
    feeRate: number, numInputs: number, numOutputs: number,
): number => {
    return (
        numInputs * INPUT_SIZE_FOR_FEE_CAL + numOutputs * OUTPUT_SIZE_FOR_FEE_CAL + TX_BUFFER_SIZE_FOR_FEE_CAL + numInputs
    ) * feeRate;
}
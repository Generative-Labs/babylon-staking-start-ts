// import { network, validateAddress } from "@/config/network.config";

import * as dotenv from 'dotenv';
import * as bitcoin from 'bitcoinjs-lib'
import {
  getAddressBalance,
  getFundingUTXOs,
  getNetworkFees,
  getTipHeight,
  pushTx,
} from "../mempoolApi";

import { signetNetwork } from '../network';
import {
  Fees,
  Network,
  UTXO,
  WalletInfo,
  WalletProvider,
} from "./walletProvider";
import { validateAddress } from '../../config/network.config';

import * as tinysecp from 'tiny-secp256k1'
import ECPairFactory, { ECPairAPI, ECPairInterface } from 'ecpair';
import { isTaprootInput } from 'bitcoinjs-lib/src/psbt/bip371';
import { tweakSigner } from '../btc';




export const ECPair = ECPairFactory(tinysecp);


const network = signetNetwork


export class HDWallet {
  private address: any;
  private publicKeyHex: any;
  private keypair: ECPairInterface;

  constructor(address: string, privateKey: string) {
    this.keypair = ECPair.fromWIF(privateKey, network);
    this.address = address
  }

  connectWallet = async (): Promise<this> => {
    dotenv.config();

    if (!this.keypair) {
      throw new Error("Undefined keypair")
    }


    if (!this.address) {
      throw new Error("Undefined address")
    }


    if (!this.address.startsWith("tb1")) {
      throw new Error(
        "Incorrect address prefix for Testnet / Signet. Expected address to start with 'tb1'.",
      );
    }

    this.publicKeyHex = this.keypair.publicKey.toString('hex');

    return this
  };

  getWalletProviderName = async (): Promise<string> => {
    return "HD";
  };

  getAddress = async (): Promise<string> => {
    return this.address
  };

  getPublicKeyHex = async (): Promise<string> => {
    return this.publicKeyHex
  };


  signPsbt = async (psbt: bitcoin.Psbt): Promise<string> => {
    for (let i = 0; i < psbt.data.inputs.length; i++) {
      if (isTaprootInput(psbt.data.inputs[i])) {
        const signer = tweakSigner(this.keypair, { network });
        psbt.signInput(i, signer);
      } else {
        const signer = this.keypair;
        psbt.signInput(i, signer);
      }
    }

    psbt.finalizeAllInputs()
    return psbt.extractTransaction().toHex()
  }

  // Mempool calls

  getBalance = async (): Promise<number> => {
    return await getAddressBalance(await this.getAddress());
  };

  getNetworkFees = async (): Promise<any> => {
    return await getNetworkFees();
  };

  pushTx = async (txHex: string): Promise<string> => {
    return await pushTx(txHex);
  };

  getUtxos = async (address: string, amount?: number): Promise<UTXO[]> => {
    // mempool call
    return await getFundingUTXOs(address, amount);
  };

  getBTCTipHeight = async (): Promise<number> => {
    return await getTipHeight();
  };
}

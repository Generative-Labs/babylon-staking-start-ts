import { Psbt, networks } from "bitcoinjs-lib";
import { stakingTransaction } from "../btc-staking-ts";

import { apiDataToStakingScripts } from "./buildScriptApi";
import { isTaproot } from "./btc";
import {
  GlobalParamsVersion,
} from "./babylonApi";
import { HDWallet } from "./wallet/hd_wallet";


export const buildStakingPsbt = async (
  params: GlobalParamsVersion,
  btcWallet: HDWallet,
  finalityProvider: string,
  stakingTerm: number,
  btcWalletNetwork: networks.Network,
  stakingAmountSat: number,
  address: string,
  stakerPublickKeyNoCoord: string,
  fasterFeePower: number,
): Promise<Psbt> => {
  if (
    !finalityProvider ||
    stakingAmountSat < params.minStakingAmountSat ||
    stakingAmountSat > params.maxStakingAmountSat ||
    stakingTerm < params.minStakingTimeBlocks ||
    stakingTerm > params.maxStakingTimeBlocks
  ) {
    // TODO Show Popup
    // throw new Error("Invalid staking data");
  }

  let inputUTXOs = [];
  try {
    inputUTXOs = await btcWallet.getUtxos(address);
  } catch (error: Error | any) {
    throw new Error(error?.message || "UTXOs error");
  }
  if (inputUTXOs.length == 0) {
    throw new Error("Confirmed UTXOs not enough");
  }

  let scripts;
  try {
    scripts = apiDataToStakingScripts(
      finalityProvider,
      stakingTerm,
      params,
      stakerPublickKeyNoCoord,
    );
  } catch (error: Error | any) {
    throw new Error(error?.message || "Cannot build staking scripts");
  }

  let feeRate = fasterFeePower;
  // let feeRate: number;
  // try {
  //   const netWorkFee = await btcWallet.getNetworkFees();
  //   feeRate = netWorkFee.fastestFee * fasterFeePower;
  // } catch (error) {
  //   throw new Error("Cannot get network fees");
  // }
  let unsignedStakingPsbt;
  try {
    const { psbt } = stakingTransaction(
      scripts,
      stakingAmountSat,
      address,
      inputUTXOs,
      btcWalletNetwork,
      feeRate,
      isTaproot(address) ? Buffer.from(stakerPublickKeyNoCoord, "hex") : undefined,
      // `lockHeight` is exclusive of the provided value.
      // For example, if a Bitcoin height of X is provided,
      // the transaction will be included starting from height X+1.
      // https://learnmeabitcoin.com/technical/transaction/locktime/
      params.activationHeight - 1,
    );
    unsignedStakingPsbt = psbt;
  } catch (error: Error | any) {
    throw new Error(
      error?.message || "Cannot build unsigned staking transaction",
    );
  }

  return unsignedStakingPsbt

};

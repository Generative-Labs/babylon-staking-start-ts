import { StakingScriptData } from "../btc-staking-ts";
import { StakingScripts } from '../btc-staking-ts/types/StakingScripts'
import { getPublicKeyNoCoord } from "./btc";

export interface GlobalParamsVersion {
    version: number;
    activationHeight: number;
    stakingCapSat: number;
    tag: string;
    covenantPks: string[];
    covenantQuorum: number;
    unbondingTime: number;
    unbondingFeeSat: number;
    maxStakingAmountSat: number;
    minStakingAmountSat: number;
    maxStakingTimeBlocks: number;
    minStakingTimeBlocks: number;
    confirmationDepth: number;
}

// Estimated size of a transaction input in bytes for fee calculation purpose only
export const INPUT_SIZE_FOR_FEE_CAL = 180;

// Estimated size of a transaction output in bytes for fee calculation purpose only
export const OUTPUT_SIZE_FOR_FEE_CAL = 34;

// Buffer size for a transaction in bytes for fee calculation purpose only
export const TX_BUFFER_SIZE_FOR_FEE_CAL = 10;

// Estimated size of an OP_RETURN output in bytes for fee calculation purpose only
export const ESTIMATED_OP_RETURN_SIZE = 40;


export const getEstimatedFee = (
    feeRate: number, numInputs: number, numOutputs: number,
): number => {
    return (
        numInputs * INPUT_SIZE_FOR_FEE_CAL +
        numOutputs * OUTPUT_SIZE_FOR_FEE_CAL +
        TX_BUFFER_SIZE_FOR_FEE_CAL + numInputs + ESTIMATED_OP_RETURN_SIZE
    ) * feeRate;
}



// Used to recreate scripts from the data received from the API
export const apiDataToStakingScripts = (
    finalityProviderPkHex: string,
    stakingTxTimelock: number,
    globalParams: GlobalParamsVersion,
    publicKeyNoCoord: string,
): StakingScripts => {
    if (!globalParams || !publicKeyNoCoord) {
        throw new Error("Invalid data");
    }

    // Convert covenant PKs to buffers
    const covenantPKsBuffer = globalParams?.covenantPks?.map((pk) =>
        getPublicKeyNoCoord(pk),
    );

    // Create staking script data
    let stakingScriptData;
    try {
        stakingScriptData = new StakingScriptData(
            Buffer.from(publicKeyNoCoord, "hex"),
            [Buffer.from(finalityProviderPkHex, "hex")],
            covenantPKsBuffer,
            globalParams.covenantQuorum,
            stakingTxTimelock,
            globalParams.unbondingTime,
            Buffer.from(globalParams.tag, "hex"),
        );
    } catch (error: Error | any) {
        throw new Error(error?.message || "Cannot build staking script data");
    }

    // Build scripts
    let scripts;
    try {
        scripts = stakingScriptData.buildScripts();
    } catch (error: Error | any) {
        throw new Error(error?.message || "Error while recreating scripts");
    }

    return scripts;
};
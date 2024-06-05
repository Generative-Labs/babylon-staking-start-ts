/*
    URL Construction methods
*/
// The base URL for the signet API
// Utilises an environment variable specifying the mempool API we intend to

// utilise
const mempoolAPI = `https://babylon.mempool.space/signet/api/`;

export type Fees = {
    // fee for inclusion in the next block
    fastestFee: number;
    // fee for inclusion in a block in 30 mins
    halfHourFee: number;
    // fee for inclusion in a block in 1 hour
    hourFee: number;
    // economy fee: inclusion not guaranteed
    economyFee: number;
    // minimum fee: the minimum fee of the network
    minimumFee: number;
};

// UTXO is a structure defining attributes for a UTXO
export interface UTXO {
    // hash of transaction that holds the UTXO
    txid: string;
    // index of the output in the transaction
    vout: number;
    // amount of satoshis the UTXO holds
    value: number;
    // the script that the UTXO contains
    scriptPubKey: string;
}


// URL for the address info endpoint
function addressInfoUrl(address: string): URL {
    return new URL(mempoolAPI + "address/" + address);
}

// URL for the transactions info endpoint
function txInfoUrl(txid: string): URL {
    return new URL(mempoolAPI + "tx/" + txid);
}

// URL for the push transaction endpoint
function pushTxUrl(): URL {
    return new URL(mempoolAPI + "tx");
}

// URL for retrieving information about an address' UTXOs
function utxosInfoUrl(address: string): URL {
    return new URL(mempoolAPI + "address/" + address + "/utxo");
}

function txHexUrl(tx: string): URL {
    return new URL(mempoolAPI + "tx/" + tx + "/hex");
}

// URL for retrieving information about the recommended network fees
function networkFeesUrl(): URL {
    return new URL(mempoolAPI + "v1/fees/recommended");
}

// URL for retrieving the tip height of the BTC chain
function btcTipHeightUrl(): URL {
    return new URL(mempoolAPI + "blocks/tip/height");
}


export type UTXOResponse = {
    txid: string;
    vout: number;
    status: {
        confirmed: boolean;
        block_height: number;
        block_hash: string;
        block_time: number;
    };
    value: number;
};

export async function getUtxos(address: string) {
    const url = utxosInfoUrl(address)
    const response = await fetch(url, {
        method: "GET"
    })
    if (!response.ok) {
        try {
            const mempoolError = await response.text();
            // Extract the error message from the response
            const message = mempoolError.split('"message":"')[1].split('"}')[0];
            if (mempoolError.includes("error") || mempoolError.includes("message")) {
                throw new Error(message);
            } else {
                throw new Error("Error broadcasting transaction. Please try again");
            }
        } catch (error: Error | any) {
            throw new Error(error?.message || error);
        }

    } else {
        const utxos = await response.json();
        return utxos;
    }
}

export async function getTransactionHex(tx: string): Promise<string> {
    const url = txHexUrl(tx)
    const response = await fetch(url, {
        method: "GET"
    })
    if (!response.ok) {
        try {
            const mempoolError = await response.text();
            // Extract the error message from the response
            const message = mempoolError.split('"message":"')[1].split('"}')[0];
            if (mempoolError.includes("error") || mempoolError.includes("message")) {
                throw new Error(message);
            } else {
                throw new Error("Error broadcasting transaction. Please try again");
            }
        } catch (error: Error | any) {
            throw new Error(error?.message || error);
        }

    } else {
        return await response.text();
    }
}

/**
 * {
  txid: "fe80c0c2439d41d301f35570018b4239ca3204293e5e5fd68d64013e8fc45025",
  version: 2,
  locktime: 0,
  vin: [],
  vout: [],
  size: 99,
  weight: 381,
  fee: 125,
  status: {
    confirmed: true,
    block_height: 53788,
    block_hash: "0000012a49f15fdbec49f647800d26dabc4027ade9739f398f618d167128b225",
    block_time: 1630648988
  }
}
 */

export type TransactionInfo = {
    txid: string;
    version: number;
    locktime: number;
    vin: any[];
    vout: any[];
    size: number;
    weight: number;
    fee: number;
    status: {
        confirmed: boolean;
        block_height: number;
        block_hash: string;
        block_time: number;
    };
}
/**
 * Get the transaction details
 * @param tx 
 * @returns Transaction
 */
export async function getTransaction(tx: string): Promise<any> {
    const url = txInfoUrl(tx)
    // logger.info(`fetch tx: ${url}`)
    const response = await fetch(url, {
        method: "GET"
    })
    if (!response.ok) {
        try {
            const mempoolError = await response.text();
            // Extract the error message from the response
            const message = mempoolError.split('"message":"')[1].split('"}')[0];
            if (mempoolError.includes("error") || mempoolError.includes("message")) {
                throw new Error(message);
            } else {
                throw new Error("Error broadcasting transaction. Please try again");
            }
        } catch (error: Error | any) {
            throw new Error(error?.message || error);
        }

    } else {
        return await response.json();
    }
}


/**
 * Pushes a transaction to the Bitcoin network.
 * @param txHex - The hex string corresponding to the full transaction.
 * @returns A promise that resolves to the response message.
 */
export async function pushTx(txHex: string): Promise<string> {
    const response = await fetch(pushTxUrl(), {
        method: "POST",
        body: txHex,
    });
    if (!response.ok) {
        try {
            const mempoolError = await response.text();
            // Extract the error message from the response
            const message = mempoolError.split('"message":"')[1].split('"}')[0];
            if (mempoolError.includes("error") || mempoolError.includes("message")) {
                throw new Error(message);
            } else {
                throw new Error("Error broadcasting transaction. Please try again");
            }
        } catch (error: Error | any) {
            console.log(`error: ${JSON.stringify(error)}`)
            throw new Error(error?.message || error);
        }
    } else {
        return await response.text();
    }
}

/**
 * Returns the balance of an address.
 * @param address - The Bitcoin address in string format.
 * @returns A promise that resolves to the amount of satoshis that the address
 *          holds.
 */
export async function getAddressBalance(address: string): Promise<number> {
    const response = await fetch(addressInfoUrl(address));
    if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
    } else {
        const addressInfo: any = await response.json();
        return (
            addressInfo.chain_stats.funded_txo_sum -
            addressInfo.chain_stats.spent_txo_sum
        );
    }
}

/**
 * Retrieve the recommended Bitcoin network fees.
 * @returns A promise that resolves into a `Fees` object.
 */
export async function getNetworkFees() {
    const response = await fetch(networkFeesUrl());
    if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
    } else {
        const fees = await response.json();
        return fees
    }
}
// Get the tip height of the BTC chain
export async function getTipHeight(): Promise<number> {
    const response = await fetch(btcTipHeightUrl());
    const result = await response.text();
    if (!response.ok) {
        throw new Error(result);
    }
    const height = Number(result);
    if (Number.isNaN(height)) {
        throw new Error("Invalid result returned");
    }
    return height;
}

/**
 * Retrieve a set of UTXOs that are available to an address and are enough to
 * fund a transaction with a total `amount` of Satoshis in its output. The UTXOs
 * are chosen based on descending amount order.
 * @param address - The Bitcoin address in string format.
 * @param amount - The amount we expect the resulting UTXOs to satisfy.
 * @returns A promise that resolves into a list of UTXOs.
 */
export async function getFundingUTXOs(
    address: string,
    amount: number,
): Promise<UTXO[]> {
    // Get all UTXOs for the given address

    let utxos = null;
    try {
        let url = utxosInfoUrl(address)
        // logger.info(`fetch utxos: ${url}`)
        const response = await fetch(utxosInfoUrl(address));
        utxos = await response.json();
    } catch (error: Error | any) {
        throw new Error(error?.message || error);
    }

    // Remove unconfirmed UTXOs as they are not yet available for spending
    // and sort them in descending order according to their value.
    // We want them in descending order, as we prefer to find the least number
    // of inputs that will satisfy the `amount` requirement,
    // as less inputs lead to a smaller transaction and therefore smaller fees.
    const confirmedUTXOs = utxos
        .filter((utxo: any) => utxo.status.confirmed)
        .sort((a: any, b: any) => b.value - a.value);

    // Reduce the list of UTXOs into a list that contains just enough
    // UTXOs to satisfy the `amount` requirement.
    var sum = 0;
    for (var i = 0; i < confirmedUTXOs.length; ++i) {
        sum += confirmedUTXOs[i].value;
        if (sum > amount) {
            break;
        }
    }
    if (sum < amount) {
        return [];
    }
    const sliced = confirmedUTXOs.slice(0, i + 1);

    // Iterate through the final list of UTXOs to construct the result list.
    // The result contains some extra information,
    var result = [];
    for (var i = 0; i < sliced.length; ++i) {
        const txUrl = txInfoUrl(sliced[i].txid);
        // logger.info(`fetch picked utxo tx: ${txUrl}`)
        const response = await fetch(txUrl);
        const transactionInfo: any = await response.json();
        result.push({
            txid: sliced[i].txid,
            vout: sliced[i].vout,
            value: sliced[i].value,
            scriptPubKey: transactionInfo.vout[sliced[i].vout].scriptpubkey,
        });
    }
    return result;
}
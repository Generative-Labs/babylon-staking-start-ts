/**
 * {
    "address": [
        
    ],
    "total": 13
}
 */

export type Airdrop = {
    address: string[],
    total: number
}

export type AirdropAddressStatus = {
    address: string,
    airdorped: boolean
    value: number
}

export type AirdropStatus = {
    addresses: Map<string, AirdropAddressStatus>
    total: number
}


export type AirdropModel = {
    id?: number,
    address: string,
    airdroped: boolean,
    value: number
}
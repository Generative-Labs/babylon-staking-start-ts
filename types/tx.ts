export type TransactionTrack = {
    id: string,
    hex: string,
    confirmed: boolean,
}

export type TransactionsView = {
    previous: TransactionTrack
    allTransactions: Map<string, TransactionTrack>,
    total: number
}
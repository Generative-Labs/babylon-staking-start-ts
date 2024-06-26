#!/usr/bin/env node

/**
 * Features
 * - Generate taproot wallets 
 * - Create a json file with all cryptographic materials
 */
const crypto = require("crypto")
const program = require('commander')
const { exec } = require('child_process')
const fs = require("fs")
const path = require('path')
const bitcoin = require('bitcoinjs-lib')
const bip32 = require('bip32')
const bip39 = require('bip39')
const tinysecap = require('tiny-secp256k1')

bitcoin.initEccLib(tinysecap)


const signetNetwork = {
    messagePrefix: "\x18Bitcoin Signed Message:\n",
    bech32: "tb",
    bip32: {
        public: 0x043587cf,
        private: 0x04358394,
    },
    pubKeyHash: 0x6f,
    scriptHash: 0xc4,
    wif: 0xef,
};

program
    .option(
        '-e, --entropy <bytes>',
        'generate wallets with new entropy \n' +
        '16 bytes entropy => 12 mnemonic words \n' +
        '32 bytes entropy => 24 mnemonic words')
    .option(
        '-n, --network <network>',
        'set bitcoin network \n' +
        'regtest, testnet, signet, mainnet',
        'signet')
    .option(
        '--number <account number>',
        'set generate account number',
        10
    )
    .option(
        '-v, --verbose',
        'verbose',
        false)
    .parse(process.argv)


const network = program.network === "signet" ? signetNetwork : bitcoin.networks[program.network]
let wallets = [];
let accountNumber = program.number;


if (!program.entropy) {
    console.log('No entropy provided. Using default entropy values')
    return
}


// check jq 
exec('jq --version', (error, stdout, stderr) => {
    if (error) {
        console.error('jq not found. Please install jq first')
        throw error
    }
    console.log('jq is installed')
})

// Wallets for number
for (let i = 0; i < accountNumber; i++) {
    wallets.push(
        { [`key_${i}`]: crypto.randomBytes(Number(program.entropy)).toString("hex") }
    )
}


// Conditional log
const log = (s, v) => {
    if (program.verbose) {
        s ? console.log(s) : console.log()
        v && console.log(v)
    }
}

// Capitalize
const capitalize = (s) => {
    return s.charAt(0).toUpperCase() + s.slice(1)
}

const toXOnly = (pubKey) => pubKey.subarray(1, 33);


/**
 * Create a json file with cryptographic materials
 */
let walletsJSON = "["

// Iterate on wallets
wallets.forEach((wallet, wallet_index) => {
    //
    let walletName = capitalize(Object.keys(wallet)[0])
    // Entropy
    let entropy = wallet[Object.keys(wallet)]
    log(`${walletName} entropy:`, entropy)
    // Get mnemonic from entropy
    let mnemonic = bip39.entropyToMnemonic(wallet[Object.keys(wallet)])
    log(`${walletName} mnemonic:`, mnemonic)
    // Get seed from mnemonic
    let seed = bip39.mnemonicToSeedSync(mnemonic)
    log(`${walletName} seed:`, seed.toString('hex'))

    // Get master BIP32 master from seed
    let master = bip32.fromSeed(seed, network)

    // Get BIP32 extended private key
    let xprivMaster = master.toBase58()
    log(`${walletName} master xpriv:`, xprivMaster)
    // Get master EC private key
    let privKeyMaster = master.privateKey.toString('hex')
    log(`${walletName} master privKey:`, privKeyMaster)
    // Get private key WIF
    let wifMaster = master.toWIF()
    log(`${walletName} master wif:`, wifMaster)


    let taprootAddressMaster = bitcoin.payments.p2tr({ internalPubkey: toXOnly(master.publicKey), network }).address
    log(`${walletName} master taproot address:`, taprootAddressMaster)

    // Get BIP32 extended master public key
    let xpubMaster = master.neutered().toBase58()
    log(`${walletName} master xpub:`, xpubMaster)
    // Get master public key
    let pubKeyMaster = master.publicKey.toString('hex')
    log(`${walletName} master pubKey:`, pubKeyMaster)
    // Get master public key fingerprint
    let pubKeyFingerprintMaster = bitcoin.crypto.hash160(master.publicKey).slice(0, 4).toString('hex')
    log(`${walletName} master pubKey fingerprint:`, pubKeyFingerprintMaster)
    log()

    // Add cryptographic materials to json file
    walletsJSON +=
        `{
        "entropy": "${entropy}",
        "mnemonic": "${mnemonic}",
        "seed": "${seed.toString('hex')}", 
        "xprivMaster": "${xprivMaster}",
        "privKeyMaster": "${privKeyMaster}",
        "wifMaster": "${wifMaster}",
        "taprootAddressMaster": "${taprootAddressMaster}",
        "xpubMaster": "${xpubMaster}", 
        "pubKeyMaster": "${pubKeyMaster}",
        "pubKeyFingerprintMaster": "${pubKeyFingerprintMaster}"
    }`

    if (wallet_index + 1 != wallets.length) {
        walletsJSON += ","
    }

    /**
     * We use the Bitcoin Core BIP32 derivation path
     * m/0'/0'/i'
     *
     * We derive 3 child nodes (keypairs, addresses, etc) per wallet
     */
    // ;[...Array(3)].forEach((u, i) => {
    //     // Get child node
    //     let child = master.derivePath(`m/0'/0'/${i}'`)

    //     // Get child extended private key
    //     let xpriv = child.toBase58()
    //     log(`${walletName} child ${i} xpriv:`, xpriv)
    //     // Get child EC private key
    //     let privKey = child.privateKey.toString('hex')
    //     log(`${walletName} child ${i} privKey:`, privKey)
    //     // Get child wif private key
    //     let wif = child.toWIF()
    //     log(`${walletName} child ${i} wif:`, wif)

    //     // Get child extended public key
    //     let xpub = child.neutered().toBase58()
    //     log(`${walletName} child ${i} xpub:`, xpub)
    //     // Get child EC public key
    //     let pubKey = child.publicKey.toString('hex')
    //     log(`${walletName} child ${i} pubKey:`, pubKey)
    //     // Get child EC public key hash
    //     let pubKeyHash = bitcoin.crypto.hash160(child.publicKey).toString('hex')
    //     log(`${walletName} child ${i} pubKey hash:`, pubKeyHash)
    //     // Get child EC public key fingerprint
    //     let pubKeyFingerprint = bitcoin.crypto.hash160(child.publicKey).slice(0, 4).toString('hex')
    //     log(`${walletName} child ${i} pubKey fingerprint:`, pubKeyFingerprint)

    //     // Addresses
    //     // P2PKH
    //     let p2pkh = bitcoin.payments.p2pkh({ pubkey: child.publicKey, network }).address
    //     log(`${walletName} child ${i} address p2pkh:`, p2pkh)
    //     // P2WPKH
    //     let p2wpkh = bitcoin.payments.p2wpkh({ pubkey: child.publicKey, network })
    //     let p2wpkhAddress = p2wpkh.address
    //     log(`${walletName} child ${i} address p2wpkh:`, p2wpkhAddress)
    //     // P2SH-P2WPKH
    //     let p2sh_p2wpkh = bitcoin.payments.p2sh({ redeem: p2wpkh, network }).address
    //     log(`${walletName} child ${i} address p2sh-p2wpkh:`, p2sh_p2wpkh)
    //     log()

    //     walletsJSON +=
    //         `{
    //   "xpriv": "${xpriv}",
    //   "privKey": "${privKey}",
    //   "wif": "${wif}", 
    //   "xpub": "${xpub}",
    //   "pubKey": "${pubKey}", 
    //   "pubKeyHash": "${pubKeyHash}",
    //   "pubKeyFingerprint": "${pubKeyFingerprint}",
    //   "p2pkh": "${p2pkh}", 
    //   "p2sh-p2wpkh": "${p2sh_p2wpkh}", 
    //   "p2wpkh": "${p2wpkhAddress}",
    //   "path": "m/0\\u0027/0\\u0027/${i}\\u0027"
    // }`

    //     // Add comma for all derivations but not last
    //     if (i < 2) walletsJSON += `,`
    // })

    // No comma for last wallet
    // wallet_index === accountNumber ? walletsJSON += "]}" : walletsJSON += "],"
    if (wallet_index + 1 === wallets.length) {
        walletsJSON += "]"
    }
    log()
})

// Check if installed as a node module or not
const nodeModulePath = path.resolve(__dirname, 'node_modules', 'bitcointestwalletsgenerator')
const libDir = fs.existsSync(nodeModulePath) ? nodeModulePath : __dirname

exec(
    // Write the json file
    `echo '${walletsJSON}' | jq . > wallets.json`, (error, stdout, stderr) => {
        if (error) {
            console.error('stderr', stderr)
            throw error
        }
        stdout && console.log(stdout)
        console.log('wallets.json has been written successfully')
        console.log()

        // Import private keys to Bitcoin Core
        // exec('./import_privkeys.sh', { 'cwd': libDir }, (error, stdout, stderr) => {
        //     if (error) {
        //         console.error(stderr)
        //     } else {
        //         console.log('Private keys have been imported to Bitcoin Core successfully')
        //     }
        // })
    })
// XXX Bytecode changes if contract is moved into a new folder (huh?)
//const { bytecode:accountBytecode } = require('../build/contracts/ZippieAccountERC20.json')
const accountBytecode = '0x608060405234801561001057600080fd5b50600080546001600160a01b03191633179055610171806100326000396000f3fe608060405234801561001057600080fd5b506004361061002b5760003560e01c8063daea85c514610030575b600080fd5b6100566004803603602081101561004657600080fd5b50356001600160a01b0316610058565b005b6000546001600160a01b0316331461006f57600080fd5b60408051600160e01b63095ea7b3028152336004820152600019602482015290516001600160a01b0383169163095ea7b39160448083019260209291908290030181600087803b1580156100c257600080fd5b505af11580156100d6573d6000803e3d6000fd5b505050506040513d60208110156100ec57600080fd5b50516101425760408051600160e51b62461bcd02815260206004820152600e60248201527f417070726f7665206661696c6564000000000000000000000000000000000000604482015290519081900360640190fd5b32fffea165627a7a7230582032c59f0247a959ee08569c8456e1b35a213a36088625adeb369ffa1a46228e3e0029'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

module.exports = {
	ZERO_ADDRESS,
	getAccountAddress,
	getTransferPaymentSignature,
}

function getAccountAddress(merchantId, orderId, walletAddress) {
	const bytecode = accountBytecode
	const bytecodeHash = web3.utils.sha3(bytecode)
	const salt = web3.utils.soliditySha3(merchantId, orderId)
	const accountHash = web3.utils.sha3(`0x${'ff'}${walletAddress.slice(2)}${salt.slice(2)}${bytecodeHash.slice(2)}`)
	const accountAddress = `0x${accountHash.slice(-40)}`.toLowerCase()
	return web3.utils.toChecksumAddress(accountAddress)
}

async function getTransferPaymentSignature(ownerAccount, merchantId, orderId, walletAddress, tokenAddress, amount, recipient) {
	// sign by multisig signer
	const transferPaymentHash = web3.utils.soliditySha3('transferPayment', merchantId, orderId, walletAddress, tokenAddress, amount, recipient)
	const transferPaymentSignature = await web3.eth.sign(transferPaymentHash, ownerAccount);
	return getRSV(transferPaymentSignature.slice(2))
}

function getRSV(str) {
	return { r: '0x' + str.slice(0,64), s: '0x' + str.slice(64,128), v: web3.utils.hexToNumber(str.slice(128,130)) + 27 };
}
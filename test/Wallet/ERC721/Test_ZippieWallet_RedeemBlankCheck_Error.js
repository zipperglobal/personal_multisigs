const BasicERC721Mock = artifacts.require("./BasicERC721Mock.sol");
const ZippieWallet = artifacts.require("./ZippieWalletERC721.sol");
const ZippieCardNonces = artifacts.require("./ZippieCardNonces.sol");

const {
	getAccountAddress,
	getRecipientSignature,
	getSignature,
	getBlankCheckSignature,
	getSignatureNoCard,
	ZERO_ADDRESS,
 } = require("./HelpFunctions");
 
contract("Test Zippie Multisig Check Cashing Error Cases", (accounts) => {
	let basicToken;
	let zippieCardNonces;
	let zippieWallet;

	const signer = accounts[0] // multisig signer (1of1)
	const signer2 = accounts[2] // multisig signer (2of2)
	const recipient = accounts[2]
	const verificationKey = accounts[4] // random verification key
	const sponsor = accounts[6] // Zippie PMG server

	beforeEach(() => {
		return BasicERC721Mock.new(sponsor).then(instance => {
			basicToken = instance;
			return ZippieCardNonces.new().then(instance => {
				zippieCardNonces = instance
				return ZippieWallet.new(zippieCardNonces.address).then(instance => {
					zippieWallet = instance;
				});
			});
		});
	});

	it("should fail a blank check transfer (from a 1 of 1 multisig) if incorrect signer", async () => {
		const signers = [signer]
		const m = [1, 1, 0, 0]
		const multisig = getAccountAddress(signers, m, zippieWallet.address)
		const tokenId = "1"
		await basicToken.transferFrom(sponsor, multisig, tokenId, {from: sponsor});
		const addresses = [basicToken.address, recipient, verificationKey]

		const incorrectSigner = accounts[42]
		const incorrectSigners = [incorrectSigner]

		const blankCheckSignature = await getBlankCheckSignature(verificationKey, signer, tokenId, addresses[0])
		const recipientSignature = await getRecipientSignature(recipient, verificationKey)

		const signature = getSignatureNoCard(blankCheckSignature, recipientSignature)
		
		const initialBalanceSender = await basicToken.balanceOf(multisig)
		const initialBalanceRecipient = await basicToken.balanceOf(recipient)
		assert(await zippieWallet.usedNonces(multisig, verificationKey) === ZERO_ADDRESS, "check already marked as cashed before transfer");
		
		try {			
			// redeem using incorrect signer
			await zippieWallet.redeemBlankCheck(addresses, incorrectSigners, m, signature.v, signature.r, signature.s, tokenId, [], {from: sponsor});
			assert(false, "transfer went through even though incorrect signer")
		} catch(error) {
			assert(error.reason === "Invalid address found when verifying signer signatures", error.reason)
		}
		
		await zippieWallet.redeemBlankCheck(addresses, signers, m, signature.v, signature.r, signature.s, tokenId, [], {from: sponsor});
		
		const amount = "1"
		const newBalanceSender = await basicToken.balanceOf(multisig)
		const newBalanceRecipient = await basicToken.balanceOf(recipient)	
		assert((initialBalanceSender - newBalanceSender).toString() === amount, "token did not transfer from sender");
		assert((newBalanceRecipient - initialBalanceRecipient).toString() === amount, "token did not transfer to recipient");
		assert(await zippieWallet.usedNonces(multisig, verificationKey) === recipient, "check has not been marked as cashed after transfer");
	});

	it("should fail a blank check transfer (from a 1 of 1 multisig) if data is signed by incorrect signer", async () => {
		const signers = [signer]
		const m = [1, 1, 0, 0]
		const multisig = getAccountAddress(signers, m, zippieWallet.address)
		const tokenId = "1"		
		await basicToken.transferFrom(sponsor, multisig, tokenId, {from: sponsor});
		const addresses = [basicToken.address, recipient, verificationKey]

		const incorrectSigner = accounts[42]

		// sign incorrect data
		const blankCheckSignature = await getBlankCheckSignature(verificationKey, incorrectSigner, tokenId, addresses[0])
		const recipientSignature = await getRecipientSignature(recipient, verificationKey)

		const signature = getSignatureNoCard(blankCheckSignature, recipientSignature)
		
		const initialBalanceSender = await basicToken.balanceOf(multisig)
		const initialBalanceRecipient = await basicToken.balanceOf(recipient)
		assert(await zippieWallet.usedNonces(multisig, verificationKey) === ZERO_ADDRESS, "check already marked as cashed before transfer");
		
		try {
			await zippieWallet.redeemBlankCheck(addresses, signers, m, signature.v, signature.r, signature.s, tokenId, [], {from: sponsor});
			assert(false, "transfer went through even though incorrect data was signed")
		} catch(error) {
			assert(error.reason === "Invalid address found when verifying signer signatures", error.reason)
		}
		
		const newBalanceSender = await basicToken.balanceOf(multisig)
		const newBalanceRecipient = await basicToken.balanceOf(recipient)
		assert(initialBalanceSender.toString() === newBalanceSender.toString(), "sender balance changed even though no transfer happened");
		assert(initialBalanceRecipient.toString() === newBalanceRecipient.toString(), "recipient balance changed even though no transfer happened");
		assert(await zippieWallet.usedNonces(multisig, verificationKey) === ZERO_ADDRESS, "check marked as cashed even though no transfer happened");
	});

	it("should fail a blank check transfer (from a 2 of 2 multisig) if 1 incorrect signer", async () => {
		const signers = [signer, signer2]
		const m = [2, 2, 0, 0]
		const multisig = getAccountAddress(signers, m, zippieWallet.address)
		const tokenId = "1"		
		await basicToken.transferFrom(sponsor, multisig, tokenId, {from: sponsor});
		const addresses = [basicToken.address, recipient, verificationKey]

		const incorrectSigner = accounts[42]
		const incorrectSigners = [incorrectSigner, signer2]

		const blankCheckSignature = await getBlankCheckSignature(verificationKey, signer, tokenId, addresses[0])
		const blankCheckSignature2 = await getBlankCheckSignature(verificationKey, signer2, tokenId, addresses[0])
		const recipientSignature = await getRecipientSignature(recipient, verificationKey)

		const signature = getSignature(blankCheckSignature, blankCheckSignature2, recipientSignature)

		assert(await zippieWallet.usedNonces(multisig, verificationKey) === ZERO_ADDRESS, "check already marked as cashed before transfer");
		
		try {
			await zippieWallet.redeemBlankCheck(addresses, incorrectSigners, m, signature.v, signature.r, signature.s, tokenId, [], {from: sponsor});
			assert(false, "transfer went through even though incorrect signer")
		} catch(error) {
			assert(error.reason === "Invalid address found when verifying signer signatures", error.reason)
		}
		
		assert(await zippieWallet.usedNonces(multisig, verificationKey) === ZERO_ADDRESS, "check marked as cashed even though no transfer happened")
	});

	it("should fail a blank check transfer (from a 2 of 2 multisig) if data is signed by incorrect signer", async () => {
		const signers = [signer, signer2]
		const m = [2, 2, 0, 0]
		const multisig = getAccountAddress(signers, m, zippieWallet.address)
		const tokenId = "1"		
		await basicToken.transferFrom(sponsor, multisig, tokenId, {from: sponsor});
		const addresses = [basicToken.address, recipient, verificationKey]

		const incorrectSigner = accounts[42]

		const blankCheckSignature = await getBlankCheckSignature(verificationKey, incorrectSigner, tokenId, addresses[0])
		const blankCheckSignature2 = await getBlankCheckSignature(verificationKey, signer2, tokenId, addresses[0])
		const recipientSignature = await getRecipientSignature(recipient, verificationKey, addresses[0])

		const signature = getSignature(blankCheckSignature, blankCheckSignature2, recipientSignature)

		assert(await zippieWallet.usedNonces(multisig, verificationKey) === ZERO_ADDRESS, "check already marked as cashed before transfer");
		
		try {
			await zippieWallet.redeemBlankCheck(addresses, signers, m, signature.v, signature.r, signature.s, tokenId, [], {from: sponsor});
			assert(false, "transfer went through even though incorrect data was signed")
		} catch(error) {
			assert(error.reason === "Invalid address found when verifying signer signatures", error.reason)
		}
		
		assert(await zippieWallet.usedNonces(multisig, verificationKey) === ZERO_ADDRESS, "check marked as cashed even though no transfer happened")
	});

	it("should fail a blank check transfer (from a 2 of 2 multisig) if signers are the same", async () => {
		const signers = [signer, signer]
		const m = [2, 2, 0, 0]
		const multisig = getAccountAddress(signers, m, zippieWallet.address)
		const tokenId = "1"		
		await basicToken.transferFrom(sponsor, multisig, tokenId, {from: sponsor});
		const addresses = [basicToken.address, recipient, verificationKey]
		
		const blankCheckSignature = await getBlankCheckSignature(verificationKey, signer, tokenId, addresses[0])
		const blankCheckSignature2 = await getBlankCheckSignature(verificationKey, signer2, tokenId, addresses[0])
		const recipientSignature = await getRecipientSignature(recipient, verificationKey)

		const signature = getSignature(blankCheckSignature, blankCheckSignature2, recipientSignature)

		assert(await zippieWallet.usedNonces(multisig, verificationKey) === ZERO_ADDRESS, "check already marked as cashed before transfer");
		
		try {
			await zippieWallet.redeemBlankCheck(addresses, signers, m, signature.v, signature.r, signature.s, tokenId, [], {from: sponsor});
			assert(false, "transfer went through even though signers were the same")
		} catch(error) {
			assert(error.reason === "Invalid address found when verifying signer signatures", error.reason)
		}
		
		assert(await zippieWallet.usedNonces(multisig, verificationKey) === ZERO_ADDRESS, "check marked as cashed even though no transfer happened")
	});

	it("should fail a blank check transfer when the verificationKey is wrong", async () => {
		const signers = [signer]
		const m = [1, 1, 0, 0]
		const multisig = getAccountAddress(signers, m, zippieWallet.address)
		const tokenId = "1"		
		await basicToken.transferFrom(sponsor, multisig, tokenId, {from: sponsor});
		const addresses = [basicToken.address, recipient, verificationKey]

		const wrongVerificationKey = accounts[98]

		const blankCheckSignature = await getBlankCheckSignature(verificationKey, signer, tokenId, addresses[0])
		const recipientSignature = await getRecipientSignature(recipient, wrongVerificationKey)

		const signature = getSignatureNoCard(blankCheckSignature, recipientSignature)

		const initialBalanceSender = await basicToken.balanceOf(multisig)
		const initialBalanceRecipient = await basicToken.balanceOf(recipient)
		assert(await zippieWallet.usedNonces(multisig, verificationKey) === ZERO_ADDRESS, "check already marked as cashed before transfer");
		const addresses2 = [basicToken.address, recipient, wrongVerificationKey]
		
		try {
			await zippieWallet.redeemBlankCheck(addresses2, signers, m, signature.v, signature.r, signature.s, tokenId, [], {from: sponsor});
			assert(false, "Verification Key was incorrect, but transfer went through!")
		} catch(error) {
			assert(error.reason === "Invalid address found when verifying signer signatures", error.reason)
		}

		try {
			await zippieWallet.redeemBlankCheck(addresses, signers, m, signature.v, signature.r, signature.s, tokenId, [], {from: sponsor});
			assert(false, "Verification Key was correct, transfer still failed!")
		} catch(error) {
			assert(error.reason === "Invalid nonce", error.reason)
		}

		const amount = "0"
		const newBalanceSender = await basicToken.balanceOf(multisig)
		const newBalanceRecipient = await basicToken.balanceOf(recipient)	
		assert((initialBalanceSender - newBalanceSender).toString() === amount, "token transfer from sender even if transaction didn't went through");
		assert((newBalanceRecipient - initialBalanceRecipient).toString() === amount, "token transfer to recipient even if transaction didn't went through");
		assert(await zippieWallet.usedNonces(multisig, verificationKey) === ZERO_ADDRESS, "check has been marked as cashed even if transaction didn't went through");
	});

	it("should fail a blank check transfer (from a 1 of 1 multisig) if multisig is not owner of tokenId", async () => {
		const signers = [signer]
		const m = [1, 1, 0, 0]
		const multisig = getAccountAddress(signers, m, zippieWallet.address)
		const tokenId = "1"
		const addresses = [basicToken.address, recipient, verificationKey]

		const blankCheckSignature = await getBlankCheckSignature(verificationKey, signer, tokenId, addresses[0])
		const recipientSignature = await getRecipientSignature(recipient, verificationKey)

		const signature = getSignatureNoCard(blankCheckSignature, recipientSignature)

		assert(await zippieWallet.usedNonces(multisig, verificationKey) === ZERO_ADDRESS, "check already marked as cashed before transfer");

		const ownerOfToken1 = await basicToken.ownerOf("1")
		assert(ownerOfToken1.toLowerCase() !== multisig, "initial owner of token 1 is incorrect")

		try {
			await zippieWallet.redeemBlankCheck(addresses, signers, m, signature.v, signature.r, signature.s, tokenId, [], {from: sponsor});
			assert(false, "transfer went through, but should have failed since token sender is not owner")
		} catch (error) {
			// ERC20 will throw error here but there's no revert reason, otherwise it would have gotten propogated here
			assert(error.message.includes("VM Exception"), error.message)
		}

		assert(await zippieWallet.usedNonces(multisig, verificationKey) === ZERO_ADDRESS, "check was incorrectly marked as cashed after failed transfer");
	});
});
pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

/**
    @title Zippie Multisig Wallet
    @author Zippie
    @notice Handles interactions with Zippie multisig wallets
    @dev NOTE: YOUR SIGNING APPLICATION MAY NOT PREPEND "\x19Ethereum Signed Message:\n32" TO THE OBJECT TO BE SIGNED. 
    FEEL FREE TO REMOVE IF NECESSARY
 */
contract ZippieMultisigWallet {

    // this is needed to prevent someone from reusing signatures to create unwanted transactions and drain a multsig
    mapping (address => uint256) addressNonceMapping;
    mapping (address => mapping(address => bool)) public checkCashed;
    mapping (address => mapping(bytes32 => bool)) public cardNonces;

    /** @notice Redeems a check after verifying all required signers/cards
        @dev Upon successful verification of the signatures, it's necessary to verify that the signers signed keccak256(recipient, amount, nonce)
        The nonce must be the value in addressNonceMapping[multsig account] + 1
        @param addresses multisig address, erc20 contract address, recipient
        [0] multisig account to withdraw ERC20 tokens from
        [1] ERC20 contract to use
        [2] recipient of the ERC20 tokens
      * @param allSignersPossible signers followed by card signers
      * @param m the amount of signatures required to transfer from the multisig account
        [0] number of signers
        [1] minimum number of signers
        [2] number of card signers
        [3] minimum number of card signers
      * @param v v values of all signatures
        [0] multisig account signature
        [1..i] signer signatures of check
        [i+1..j] card signatures of random card nonces
      * @param r r values of all signatures (structured as v)
      * @param s s values of all signatures (structured as v)
      * @param nonce an incremental nonce TODO: Perhaps this should be random? Otherwise, don't checks have to be redeemed in order?
      * @param amount amount to transfer
      * @param cardDigests random values generated by cards at every read
      */
    function redeemCheck(address[] addresses, address[] allSignersPossible, uint8[] m, uint8[] v, bytes32[] r, bytes32[] s, uint256 nonce, uint256 amount, bytes32[] cardDigests) public {
        require(verifySignatureRequirements(m, allSignersPossible.length, v, r, s, 1, cardDigests.length), "Invalid check signatures");
        require(isValidCheck(addresses, nonce),  "Invalid check");
        require(verifyMultisigKeyAllowsAddresses(allSignersPossible, m, addresses[0], v[0], r[0], s[0]), "Invalid address");

        // get the check hash (amount, recipient, nonce) to verify signer signatures
        bytes32 hashVerify = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(abi.encodePacked(amount, addresses[2], nonce))));
        // verify that the signers signed that they want to transfer "amount" ERC20 tokens and verify card signatures
        verifySignatures(hashVerify, allSignersPossible, m, v, r, s, cardDigests);

        // transfer tokens
        ERC20(addresses[1]).transferFrom(addresses[0], addresses[2], amount);
            
        // increment the nonce
        addressNonceMapping[addresses[0]] = nonce;
    }

    /** @notice Redeems a blank check after verifying all required signers/cards
        @dev Upon successful verification of the signatures, it's necessary to verify that the signers signed keccak256(amount, verification key)
      * @param addresses multisig address, erc20 contract address, recipient, verification key
        [0] multisig account to withdraw ERC20 tokens from
        [1] ERC20 contract to use
        [2] recipient of the ERC20 tokens
        [3] verification key TODO: blank check key?
      * @param allSignersPossible signers followed by card signers
      * @param m the amount of signatures required to transfer from the multisig account
        [0] number of signers
        [1] minimum number of signers
        [2] number of card signers
        [3] minimum number of card signers
      * @param v v values of all signatures
        [0] multisig account signature
        [1..i] signer signatures of check
        [i+1..j] card signatures of random card nonces
        [j+1] verification key signature
      * @param r r values of all signatures (structured as v)
      * @param s s values of all signatures (structured as v)
      * @param amount amount to transfer
      * @param cardDigests random values generated by cards at every read
      */
    function redeemBlankCheck(address[] addresses, address[] allSignersPossible, uint8[] m, uint8[] v, bytes32[] r, bytes32[] s, uint256 amount, bytes32[] cardDigests) public {
        require(verifySignatureRequirements(m, allSignersPossible.length, v, r, s, 2, cardDigests.length), "Invalid blank check signatures");
        require(isValidBlankCheck(addresses),  "Invalid blank check");
        require(verifyMultisigKeyAllowsAddresses(allSignersPossible, m, addresses[0], v[0], r[0], s[0]), "Invalid address");

        // get the blank check hash (amount, verification key) to verify signer signatures
        bytes32 hashVerify = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(abi.encodePacked(amount, addresses[3]))));
        // verify that the signers signed that they want to transfer "amount" ERC20 token and verify card signatures
        verifySignatures(hashVerify, allSignersPossible, m, v, r, s, cardDigests);

        // verify that the last signature is the verification key signing the recipient address
        hashVerify = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(abi.encodePacked(addresses[2]))));
        address addressVerify = ecrecover(hashVerify, v[s.length - 1], r[s.length - 1], s[s.length - 1]);
        require(addressVerify == addresses[3], "Incorrect address");

        // flag check as redeemed to prevent reuse
        checkCashed[addresses[0]][addresses[3]] = true;

        // transfer tokens
        require(ERC20(addresses[1]).transferFrom(addresses[0], addresses[2], amount), "Transfer failed");
    }

    /** @dev Verify that all signatures were addresses in allSignersPossible, 
            that they all signed keccak256(amount, verificationKey) or keccak256(amount, receiver, nonce) (for cards)
            and that there are no duplicate signatures/addresses
     */
    function verifySignatures(bytes32 hashVerify, address[] allSignersPossible, uint8[] m, uint8[] v, bytes32[] r, bytes32[] s, bytes32[] cardDigests) internal {
        // make a memory mapping of (addresses => used this address?) to check for duplicates
        address[] memory usedAddresses = new address[](m[1] + m[3]);

        // loop through and ec_recover each v[] r[] s[] and verify that a correct address came out, and it wasn't a duplicate
        address addressVerify;

        for (uint8 i = 1; i < m[1] + m[3] + 1; i++) {

            if (i > m[1]) {
                // verify card digests
                bytes32 digest = cardDigests[i - m[0] - 1];
                hashVerify = digest;
                require(cardNonces[allSignersPossible[i - 1]][digest] == false, "Card nonce reused");
                // store the card digest to prevent future reuse
                cardNonces[allSignersPossible[i - 1]][digest] = true;
            }

            // get address from ec_recover
            addressVerify = ecrecover(hashVerify, v[i], r[i], s[i]);

            // check that address is a valid address 
            require(checkIfAddressInArray(allSignersPossible, addressVerify), "Invalid address found when verifying signatures");

            // check that this address has not been used before
            require(!checkIfAddressInArray(usedAddresses, addressVerify), "Address has been used already");

            // push this address to the usedAddresses array
            usedAddresses[i - 1] = addressVerify;
        }
    }

    function checkIfAddressInArray(address[] validAddresses, address checkAddress) internal pure returns(bool) {
        for (uint i = 0; i < validAddresses.length; i++) {
            if (checkAddress == validAddresses[i]) {
                return true;
            }
        }
        
        return false;
    }

    /** @dev verify that the multisig account (temp priv key) signed to allow this array of addresses to access the account's funds.
        the temporary private key will keccak256 this array and m, to allow m of allSignersPossible.length = n signatures in that array to transfer from the wallet
        @return true if the multisig address signed this hash, else false 
     */
    function verifyMultisigKeyAllowsAddresses(address[] signers, uint8[] m, address multisigAddress, uint8 v, bytes32 r, bytes32 s) internal pure returns(bool successfulVerification) {
        return multisigAddress == ecrecover(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(abi.encodePacked(signers, m)))), v, r, s);
    }

    function verifySignatureRequirements(uint8[] m, uint256 nrOfSigners, uint8[] v, bytes32[] r, bytes32[] s, uint256 offset, uint256 nrOfCards) internal pure returns(bool successfulVerification) {
        return 
            // require that m, allSignersPossible are well formed (m <= nrOfSigners, m not zero, and m not MAX_UINT8)
            m[0] + m[2] == nrOfSigners &&
            m[1] + m[3] <= nrOfSigners && 
            m[1] <= m[0] && 
            m[3] <= m[2] && 
            m[1] > 0 && 
            m[1] != 0xFF &&
            // require that v/r/s.length are equal to (m + the original temp private key sig and/or the verification key)
            r.length == m[1] + m[3] + offset && 
            s.length == m[1] + m[3] + offset && 
            v.length == m[1] + m[3] + offset &&
            nrOfCards == m[3];
    }

    function isValidCheck(address[] addresses, uint256 nonce) internal view returns(bool successfulVerification) {
        return 
            addresses.length == 3 &&
            nonce == addressNonceMapping[addresses[0]] + 1; // verify nonce is incremented by 1
    }

    function isValidBlankCheck(address[] addresses) internal view returns(bool successfulVerification) {
        return 
            addresses.length == 4 &&  
            !checkCashed[addresses[0]][addresses[3]];
    }
}
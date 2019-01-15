pragma solidity ^0.5.0;

import "./IZippieCardNonces.sol";

/**
  * @title Zippie Card Nonces (global data store)
  * @dev Store smart cards (2FA) nonces so they cannot 
  * be resused between different contracts using the same card
 */
contract ZippieCardNonces is IZippieCardNonces {

    // used nonces
    mapping (address => mapping(bytes32 => bool)) private _usedNonces;

    /**
      * @dev Check if a card nonce has been used already
      * @param signer card address
      * @param nonce nonce value
      */
    function isNonceUsed(
        address signer, 
        bytes32 nonce
    ) 
        public 
        view 
        returns (bool) 
    {
        return _usedNonces[signer][nonce];
    }

    /**
      * @dev Mark a nonce as used for a specific card
      * a card need to sign the nonce to mark it as used 
      * this also means that no one else can mark it as used
      * @param signer card address that signed the nonce
      * @param nonce random nonce values generated by cards at every read
      * @param v v values of the card signature
      * @param r r values of the card signature
      * @param s s values of the card signature
      */
    function useNonce(
        address signer, 
        bytes32 nonce, 
        uint8 v, 
        bytes32 r,
        bytes32 s
    ) 
        public 
        returns(bool) 
    {
        require(
            _usedNonces[signer][nonce] == false, 
            "Card nonce already used"
        );
        require(
            signer == ecrecover(nonce, v, r, s), 
            "Invalid card nonce signature"
        );
        _usedNonces[signer][nonce] = true;
        return true;
    }
}
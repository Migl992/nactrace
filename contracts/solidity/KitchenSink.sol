// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// One contract that can trigger every NAC edge case nactrace must explain. Deployed on Previewnet
// by scripts/previewnet/04-kitchen-sink.mjs; the resulting hashes are pinned in fixtures/hashes.json.

interface INativeAtomicGateway {
    function callMichelson(string calldata destination, string calldata entrypoint, bytes calldata data)
        external
        payable;
    function callMichelsonView(string calldata destination, string calldata viewName, bytes calldata input)
        external
        view
        returns (bytes memory);
}

contract NacKitchenSink {
    address internal constant GATEWAY = 0xfF00000000000000000000000000000000000007;
    bytes internal constant UNIT = hex"030b";

    string public counter;
    bool public lastOk;
    bytes public lastRet;

    event Caught(bool ok, bytes ret);
    error Boom(uint256 code);

    constructor(string memory michelsonCounter) {
        counter = michelsonCounter;
    }

    function _raw(string memory dest, string memory ep, bytes memory data, uint256 gasLimit, uint256 value)
        internal
        returns (bool ok, bytes memory ret)
    {
        bytes memory cd = abi.encodeWithSelector(INativeAtomicGateway.callMichelson.selector, dest, ep, data);
        (ok, ret) = GATEWAY.call{gas: gasLimit, value: value}(cd);
    }

    function _bubble(bool ok, bytes memory ret) internal pure {
        if (!ok) {
            if (ret.length > 0) {
                assembly ("memory-safe") {
                    revert(add(ret, 0x20), mload(ret))
                }
            }
            revert("gateway call failed without data");
        }
    }

    /// Caught revert: the crossing fails but the transaction succeeds (partially_caught).
    function decrementCaught() external {
        (bool ok, bytes memory ret) = _raw(counter, "decrement", UNIT, 3_000_000, 0);
        lastOk = ok;
        lastRet = ret;
        emit Caught(ok, ret);
    }

    /// Gas starvation of the gateway frame.
    function incrementWithGas(uint256 gasLimit) external {
        (bool ok, bytes memory ret) = _raw(counter, "increment", UNIT, gasLimit, 0);
        _bubble(ok, ret);
    }

    /// Entrypoint that does not exist on the Michelson contract.
    function callMissingEntrypoint() external {
        (bool ok, bytes memory ret) = _raw(counter, "nope", UNIT, 3_000_000, 0);
        _bubble(ok, ret);
    }

    /// Ill-typed Micheline parameter (increment takes unit, we send a string).
    function callBadParams() external {
        (bool ok, bytes memory ret) = _raw(counter, "increment", hex"01000000026869", 3_000_000, 0);
        _bubble(ok, ret);
    }

    /// Destination that does not exist (or is malformed).
    function callMissingContract(string calldata dest) external {
        (bool ok, bytes memory ret) = _raw(dest, "increment", UNIT, 3_000_000, 0);
        _bubble(ok, ret);
    }

    /// Three crossings in one transaction: +1, +1, -1.
    function multiCross() external {
        for (uint256 i = 0; i < 2; i++) {
            (bool ok, bytes memory ret) = _raw(counter, "increment", UNIT, 3_000_000, 0);
            _bubble(ok, ret);
        }
        (bool ok2, bytes memory ret2) = _raw(counter, "decrement", UNIT, 3_000_000, 0);
        _bubble(ok2, ret2);
    }

    /// Two crossings where the second fails: the first one must be rolled back too.
    function incrementThenFail() external {
        (bool ok, bytes memory ret) = _raw(counter, "increment", UNIT, 3_000_000, 0);
        _bubble(ok, ret);
        (bool ok2, bytes memory ret2) = _raw(counter, "nope", UNIT, 3_000_000, 0);
        _bubble(ok2, ret2);
    }

    /// Value transfer to a Michelson address through the gateway.
    function sendTez(string calldata dest) external payable {
        (bool ok, bytes memory ret) = _raw(dest, "default", bytes(""), 3_000_000, msg.value);
        _bubble(ok, ret);
    }

    /// View that does not exist.
    function readMissingView() external {
        (bool ok, bytes memory ret) = GATEWAY.staticcall(
            abi.encodeWithSignature("callMichelsonView(string,string,bytes)", counter, "nope", UNIT)
        );
        lastOk = ok;
        lastRet = ret;
        _bubble(ok, ret);
    }

    // ---- targets for Michelson-originated calls (tz1 -> %call_evm -> here)

    function boom() external pure {
        revert("boom from EVM");
    }

    function boomCustom() external pure {
        revert Boom(42);
    }

    /// Crosses back into Michelson successfully, then reverts: nested rollback.
    function incrementThenBoom() external {
        (bool ok, bytes memory ret) = _raw(counter, "increment", UNIT, 3_000_000, 0);
        _bubble(ok, ret);
        revert("boom after crossing");
    }

    /// Plain success target.
    function ping() external pure returns (uint256) {
        return 1;
    }
}

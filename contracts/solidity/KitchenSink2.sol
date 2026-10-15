// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Second batch of edge cases (scripts/previewnet/07-deeper-cases.mjs): mixed outcomes inside one
// transaction, value into a Michelson entrypoint, a view next to a crossing.

interface INativeAtomicGateway {
    function callMichelson(string calldata destination, string calldata entrypoint, bytes calldata data)
        external
        payable;
    function callMichelsonView(string calldata destination, string calldata viewName, bytes calldata input)
        external
        view
        returns (bytes memory);
}

contract NacKitchenSink2 {
    address internal constant GATEWAY = 0xfF00000000000000000000000000000000000007;
    bytes internal constant UNIT = hex"030b";

    string public counter;
    bool public firstOk;
    bytes public viewResult;

    event Outcome(bool firstOk, bool secondOk);

    constructor(string memory michelsonCounter) {
        counter = michelsonCounter;
    }

    function _raw(string memory ep, uint256 value) internal returns (bool ok, bytes memory ret) {
        bytes memory cd = abi.encodeWithSelector(INativeAtomicGateway.callMichelson.selector, counter, ep, UNIT);
        (ok, ret) = GATEWAY.call{gas: 3_000_000, value: value}(cd);
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

    /// First crossing fails and is caught (decrement at zero), second applies (increment). Tx succeeds.
    function caughtThenIncrement() external {
        (bool ok, ) = _raw("decrement", 0);
        firstOk = ok;
        (bool ok2, bytes memory ret2) = _raw("increment", 0);
        _bubble(ok2, ret2);
        emit Outcome(ok, ok2);
    }

    /// Crossing into a contract entrypoint while carrying tez (the counter accepts any amount).
    function incrementWithValue() external payable {
        (bool ok, bytes memory ret) = _raw("increment", msg.value);
        _bubble(ok, ret);
    }

    /// A read-only view followed by a state-changing crossing, in one transaction.
    function readThenIncrement() external {
        (bool ok, bytes memory ret) = GATEWAY.staticcall(
            abi.encodeWithSignature("callMichelsonView(string,string,bytes)", counter, "get_counter", UNIT)
        );
        _bubble(ok, ret);
        viewResult = abi.decode(ret, (bytes));
        (bool ok2, bytes memory ret2) = _raw("increment", 0);
        _bubble(ok2, ret2);
    }
}

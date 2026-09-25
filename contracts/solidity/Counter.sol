// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Verbatim from https://docs.etherlink.com/tutorials/nac-counter (EvmToMichelsonCounter),
// plus CounterViewReader modelled on the kernel example crac_michelson_view_staticcall.sol.

interface INativeAtomicGateway {
    function callMichelson(string calldata destination, string calldata entrypoint, bytes calldata data)
        external
        payable;
}

contract EvmToMichelsonCounter {
    address internal constant NAC_GATEWAY = 0xfF00000000000000000000000000000000000007;

    INativeAtomicGateway public immutable gateway;
    string public michelsonCounter;
    bytes internal constant UNIT = hex"030b";
    uint256 internal constant GATEWAY_GAS = 3_000_000;

    event CounterCalled(address indexed caller, string action, string michelsonCounter);

    constructor(string memory michelsonCounterAddress) {
        gateway = INativeAtomicGateway(NAC_GATEWAY);
        michelsonCounter = michelsonCounterAddress;
    }

    function _callMichelson(string memory entrypoint) private {
        bytes memory callData =
            abi.encodeWithSelector(INativeAtomicGateway.callMichelson.selector, michelsonCounter, entrypoint, UNIT);
        (bool ok, bytes memory ret) = address(gateway).call{gas: GATEWAY_GAS}(callData);
        if (!ok) {
            if (ret.length > 0) {
                assembly ("memory-safe") {
                    revert(add(ret, 0x20), mload(ret))
                }
            }
            revert("NAC gateway call failed");
        }
    }

    function increment() external {
        _callMichelson("increment");
        emit CounterCalled(msg.sender, "increment", michelsonCounter);
    }

    function decrement() external {
        _callMichelson("decrement");
        emit CounterCalled(msg.sender, "decrement", michelsonCounter);
    }

    function reset() external {
        _callMichelson("reset");
        emit CounterCalled(msg.sender, "reset", michelsonCounter);
    }
}

contract CounterViewReader {
    address constant GATEWAY = 0xfF00000000000000000000000000000000000007;
    string public destination;
    bytes public lastResponse;

    event ViewRead(bytes response);

    error CracMichelsonViewFailed();

    constructor(string memory _destination) {
        destination = _destination;
    }

    // Reads the Michelson `get_counter` view through the gateway with STATICCALL and stores the
    // ABI-decoded Micheline response, so the read-only crossing lands on chain in a receipt.
    function readView() external {
        (bool success, bytes memory ret) = GATEWAY.staticcall(
            abi.encodeWithSignature("callMichelsonView(string,string,bytes)", destination, "get_counter", hex"030b")
        );
        if (!success) revert CracMichelsonViewFailed();
        lastResponse = abi.decode(ret, (bytes));
        emit ViewRead(lastResponse);
    }
}

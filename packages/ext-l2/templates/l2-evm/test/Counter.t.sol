// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Counter} from "../src/Counter.sol";

/// Plain Solidity tests (no forge-std: nothing to download). forge runs every `test*` function; a revert fails it.
contract CounterTest {
    Counter internal counter;

    function setUp() public {
        counter = new Counter();
    }

    function test_Increment() public {
        counter.increment();
        require(counter.number() == 1, "increment");
    }

    function testFuzz_SetNumber(uint256 value) public {
        counter.setNumber(value);
        require(counter.number() == value, "setNumber");
    }

    function test_DecrementBelowZeroReverts() public {
        try counter.decrement() {
            revert("decrement at zero did not revert");
        } catch (bytes memory reason) {
            require(bytes4(reason) == Counter.CounterUnderflow.selector, "wrong revert reason");
        }
    }
}

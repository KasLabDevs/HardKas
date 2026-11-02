// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// A minimal contract: one stored number, set, incremented or decremented (never below zero).
contract Counter {
    uint256 public number;

    event NumberChanged(uint256 value);

    error CounterUnderflow();

    function setNumber(uint256 value) external {
        number = value;
        emit NumberChanged(value);
    }

    function increment() external {
        number += 1;
        emit NumberChanged(number);
    }

    function decrement() external {
        if (number == 0) revert CounterUnderflow();
        number -= 1;
        emit NumberChanged(number);
    }
}

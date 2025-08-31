// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console2} from "forge-std/Script.sol";
import {Counter} from "../src/Counter.sol";
import { AverageBalance } from "../src/vlayer/AverageBalance.sol";


import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";


contract DeployAverageBalance is Script {
    function run() external {
        // Lee variables de entorno
        address token = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;            // p.ej. USDC Base
        uint256 startBlock = 20902135; // p.ej. 20902135
        uint256 endBlock   = 34902135;   // p.ej. 34902135
        uint256 step       = 50000;           // p.ej. 100000

        vm.startBroadcast();

        AverageBalance avg = new AverageBalance(
            IERC20(token),
            startBlock,
            endBlock,
            step
        );

        vm.stopBroadcast();

        console2.log("AverageBalance deployed at:", address(avg));
        console2.log("TOKEN:", token);
        console2.log("STARTING_BLOCK:", startBlock);
        console2.log("ENDING_BLOCK:", endBlock);
        console2.log("STEP:", step);
    }
}

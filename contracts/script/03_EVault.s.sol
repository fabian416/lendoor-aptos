// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import {GenericFactory} from "evk/GenericFactory/GenericFactory.sol";

contract EVaultDeployer is Script {
    function run() public returns (address eVault) {
        // Read the input
        string memory json = vm.envString("INPUT_JSON");

        // Like deployRouterForOracle = false, we ignore oracleRouterFactory
        address eVaultFactory = vm.parseJsonAddress(json, ".eVaultFactory");
        bool upgradable       = vm.parseJsonBool(json, ".upgradable");
        address asset         = vm.parseJsonAddress(json, ".asset");
        address oracle        = vm.parseJsonAddress(json, ".oracle");
        address unitOfAccount = vm.parseJsonAddress(json, ".unitOfAccount");

        vm.startBroadcast();
        eVault = address(
            GenericFactory(eVaultFactory).createProxy(
                address(0),                         // use the implementation set in the factory
                upgradable,                         // false in the json
                abi.encodePacked(asset, oracle, unitOfAccount)
            )
        );
        vm.stopBroadcast();

        // save output
        string memory outPath = string.concat(vm.projectRoot(), "/script/07_EVault_output.json");
        string memory obj = vm.serializeAddress("eVault", "eVault", eVault);
        vm.writeJson(obj, outPath);
    }
}
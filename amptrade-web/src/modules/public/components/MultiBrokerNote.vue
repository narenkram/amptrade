<template>
    <div class="row justify-content-center">
        <div class="col-12">
            <div class="alert alert-info small">
                <FontAwesomeIcon :icon="['fas', 'info-circle']" class="me-2" />
                <strong>Note:</strong> In Multi Broker Trading, you can only connect multiple broker accounts
                that share the same API architecture. For example, Flattrade, Shoonya, Infinn, TradeSmart,
                and Zebu all use the NorenAPI architecture and can be connected simultaneously.
                Zerodha uses the KiteConnect API, so Zerodha accounts can only be connected with other
                Zerodha accounts. Similarly, Upstox uses its own API, so Upstox accounts can only be
                connected with other Upstox accounts.
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
</script>

<script lang="ts" setup>
import { curCaretPos } from '../assets/js/store'

</script>

<template>
    <div id="status-bar">
        <div id="status-bar-left-container">
            This is a status bar.
        </div>
        <div id="status-bar-right-container">
            <div id="caret-status">
                <div id="caret-line-status">
                    B <span id="caret-row-number">{{ curCaretPos.row }}</span>
                </div>
                <div id="caret-row-status">
                    C <span id="caret-col-number">{{ curCaretPos.col }}</span>
                </div>
            </div>
            Words: <span id="word-count"></span>
        </div>
    </div>
</template>

<style scope>
#status-bar {
    font-size: 12px;
    z-index: 5;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    /* background-color: rgb(30, 30, 30); */
    height: 24px;
    padding: 4px;
    vertical-align: middle;
    box-shadow: rgba(0, 0, 0, 0.35) 0px 5px 15px;
    /* background-color: rgb(240, 240, 240); */
}

#status-bar-left-container {
    display: flex;
    flex-direction: row;
    padding-left: 4px;
}

#status-bar-right-container {
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    padding-right: 4px;
    gap: 8px;
}

#caret-status {
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    gap: 2px;
}
</style>
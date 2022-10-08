import { reactive } from "vue"
import { CaretPos } from "./caretPos"

export const curCaretPos: CaretPos = reactive({
    row: 1,
    col: 1,
})
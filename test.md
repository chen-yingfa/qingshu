# 你好！

> 这是一个注释

《桃花庵歌》

桃花坞里桃花庵，桃花庵里桃花仙。

桃花仙人种桃树，又折花枝当酒钱。

## Markdown 测试

There are 3 types of [Transformers](example.com) architecture.

- Encoder-decoder:
    - Original transformers[^1], the input is fed to a stack of encoders, which outputs a hidden state of shape (n, d).
    - The decoder produces the output sequence autoregressively[^2] while attending to the encoder's hidden states with cross-attention.
- Encoder-only
- Decoder-only

Let $\text{Encoder}(\cdot;\theta)$ denote the encoder function parameterized by $\theta$, then we have:

$$
h = \text{Encoder}(x;\theta)
$$

where $x$ is the input sequence and $h$ is the hidden state.

[^1]: Test.
[^2]: Autoregressive means that the output of the model is fed to itself as the input to produce the next token.

## 代码测试 Code Test

二分搜索的 Python 实现，放在了 `bin_search.py` 里面：

```python
def bin_search(vec: list, target) -> int:
    '''
    Return the first first index such that when `target` is inserted
    into `vec`.
    '''
    lo, hi = 0, len(vec)
    while lo < hi:
        mid = (lo + hi) // 2
        if vec[mid] < target:
            lo = mid + 1
        else:
            hi = mid
    return lo
```

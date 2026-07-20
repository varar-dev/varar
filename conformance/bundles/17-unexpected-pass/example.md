# Unexpected pass

An `error` fence asserts the example fails. When every step passes instead, the
fence itself is the failure — otherwise a spec could silently stop testing what
it claims to.

## An example expected to fail, that passes, is a failure

I do nothing at all.

```error
boom
```

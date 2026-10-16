---
title: Fuzzing CosmWasm Smart Contracts - SRLabs Research
source: https://srlabs.de/blog/cosmwasm
source_host: srlabs.de
clip_date: 2026-10-16T10:32:13+08:00
trace_id: 14c66875-4245-41dd-9a0f-1c51dfb562f1
content_hash: 1cb56690fddb2f802ec1a341391c2aa607583e867b160f2fdbe0a98cf43be265
status: synced
tags:
  - 安全工具
  - 漏洞分析
series: null
feed_source: SRLabs·模糊测试/漏洞审计
ai_summary: SRLabs 推出 CosmFuzz，一款覆盖率引导的 CosmWasm 智能合约模糊测试器，填补该生态长期缺少成熟 fuzzer 的空白。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fb75244-d011-8153-912a-cf947abb7d47
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> SRLabs 推出 CosmFuzz，一款覆盖率引导的 CosmWasm 智能合约模糊测试器，填补该生态长期缺少成熟 fuzzer 的空白。
> 
> - **背景：** Substrate、Solidity 已有成熟 fuzzer，而基于 Rust 的 CosmWasm 此前没有专用模糊测试工具。
> - **核心特性：** 底层由 ziggy 编排器驱动，支持覆盖率引导、多核扩展、AFL++/honggfuzz 后端与覆盖率报告，并新增不变量测试、多合约交互、有状态执行、消息自动探测。
> - **演示漏洞：** 在 cw20-base 的 execute_transfer 中故意引入 off-by-one，每次转账多铸 1 个代币；用"总供应量 ≥ 所有余额之和"这一不变量捕获。
> - **使用流程：** cargo install 安装 → 编写 setup() 与不变量 → cosmfuzz init 生成配置 → cosmfuzz fuzz 运行 → cosmfuzz run 重放崩溃并打印堆栈。
> - **效果：** 演示中约 1 分钟内即报出 15 次崩溃（即不变量被违反），cosmfuzz cover 可生成覆盖率报告。

![](https://srlabs.de/img/assets/authors/srl_headshot_daniel_schmidt-320.b35cde86cb.avif)

### Key takeaways

-   **Problem**: The CosmWasm ecosystem has been missing solid fuzz testing.
-   **Solution**: [CosmFuzz](https://github.com/srlabs/cosmfuzz), a coverage-guided fuzzer for CosmWasm smart contracts.
-   **Why it matters**: Modern fuzzing engines with minimal setup and a workflow that fits smart contracts bring CosmWasm security a huge step forward.

## Motivation

In traditional code auditing, fuzzing (as introduced in parts [1](https://srlabs.de/blog/guide-to-writing-fuzzing-harness), [2](https://srlabs.de/blog/unlocking-secrets-effective-fuzzing-harness), [3](https://srlabs.de/blog/golibafl---fuzzing-go-binaries-using-libafl)) is widely used to catch bugs, and it has basically become standard for any software project that wants to take security seriously. In blockchains, the stakes are even higher. One critical bug can brick an entire project, or hand attackers a very profitable day.

Other blockchain ecosystems already have mature fuzzers. Substrate and Solidity are good examples, with things like the [substrate runtime fuzzer](https://github.com/srlabs/substrate-runtime-fuzzer) and [Echidna](https://github.com/crytic/echidna) for Solidity contracts.

When we started digging into Cosmos, CosmWasm stood out: a Rust-based smart contract platform for the Cosmos ecosystem. What surprised us was the lack of a proper fuzzer for CosmWasm smart contracts.

That gap is what we’re trying to fill.

**So we built CosmFuzz.**

## Introducing CosmFuzz: a smart contract fuzzer that just works

CosmFuzz is a coverage-guided CosmWasm smart contract fuzzer. The goal is state-of-the-art fuzzing performance with as little setup overhead as possible for smart contract developers.

Out of the box, it inherits a full set of features from our fuzzing orchestrator [ziggy](https://github.com/srlabs/ziggy), which runs under the hood:

-   Coverage-guided fuzzing
-   Scaling across CPU cores
-   Abstraction over multiple fuzzing engines (like AFL++ and honggfuzz)
-   Coverage report generation

On top of that, CosmFuzz adds smart-contract specific features:

-   Invariant testing
-   Multi-contract interactions
-   Stateful execution
-   Auto-detection of messages

Together, that gives you a clean workflow for running fuzzing campaigns against real CosmWasm contracts. To show how this works end to end, we’ll walk through the phases of a campaign using an intentionally introduced bug in `cw20-base`.

## Our target under test

Because it plays a central role in the CosmWasm ecosystem, we chose `cw20-base` as the target. The [CW20 specification](https://github.com/CosmWasm/cw-plus/blob/main/packages/cw20/README.md) defines the default fungible token standard for CosmWasm smart contracts, and `cw20-base` is a reference implementation.

The contract supports multiple messages a user can call, but for this post the key ones are token transfers and burning.

To showcase CosmFuzz properly, we’ll deliberately introduce a vulnerability in `cw20-base`. Here’s the bug:

```rust
// cw20-base/contracts/src/contract.rs

pub fn execute_transfer(...) -> Result<Response, ContractError> {
    ...
    
    BALANCES.update(
        deps.storage,
        &rcpt_addr,
        |balance: Option<Uint128>| -> StdResult<_> {
            Ok(balance.unwrap_or_default() + amount + Uint128::new(1))
        },
    )?;
    
    ...
}
```

We introduce an issue in `BALANCES.update`: when transferring `amount`, we sneak in an extra `+ 1`. That means if an attacker transfers `X` tokens, the receiver ends up with `X + 1`, effectively minting one token per transfer. It’s a simple bug, but it’s exactly the kind of thing invariant-based fuzzing is great at catching.

## Getting our hands dirty

We’ll split the campaign into three phases:

1.  **Initialization**
    -   Writing the `setup()` function
    -   Defining invariants
    -   Customizing the campaign config
2.  **Running the fuzzer**
3.  **Triaging crashes**

## Installation

Install CosmFuzz via cargo:

```bash
cargo install --git https://github.com/srlabs/cosmfuzz cosmfuzz
```

## Setting up the fuzzing campaign

The initialisation of a CosmFuzz campaign has three main pieces:

1.  A `setup()` function
2.  One or more invariants
3.  Running `cosmfuzz init` and editing the generated configuration file

### Initializing the contract

First, you need to define a `setup()` function so the fuzzer knows how to instantiate your contract(s). Most of the time you can copy this from existing unit tests or from production configs.

The setup function takes two parameters:

-   `app`: the mock environment interface
-   `accounts`: a list of default accounts that are used during fuzzing

For `cw20-base`, we define it in its `lib.rs`, gated behind the cosmfuzz feature:

```rust
// cw20-base/contracts/src/lib.rs

#[cfg(feature = "cosmfuzz")]
pub mod cosmfuzz {
    use crate::msg::QueryMsg;
    use cosmwasm_std::{Addr, Uint128};
    use cw20::{
        AllAccountsResponse, BalanceResponse, Cw20Coin, Logo, MinterResponse, TokenInfoResponse,
    };
    use cw_multi_test::App;

    const TOTAL_INITIAL_BALANCE: u128 = 10000;

    pub fn setup(app: &App, accounts: &Vec<Addr>) -> crate::msg::InstantiateMsg {
        let mut balances: Vec<Cw20Coin> = vec![];
        for account in accounts {
            balances.push(Cw20Coin {
                address: account.to_string(),
                amount: Uint128::new(TOTAL_INITIAL_BALANCE),
            });
        }

        crate::msg::InstantiateMsg {
            name: "Cash Token".to_string(),
            symbol: "CASH".to_string(),
            decimals: 9,
            initial_balances: balances,
            mint: None,
            marketing: Some(crate::msg::InstantiateMarketingInfo {
                project: Some("Project".to_owned()),
                description: Some("Description".to_owned()),
                marketing: Some("Marketing".to_string()),
                logo: Some(Logo::Url("Url".to_owned())),
            }),
        }
    }
}
```

The important bit here is the initial state: every test account starts with 10,000 tokens. That gives the fuzzer room to explore interesting state transitions.

### Writing an invariant in CosmFuzz

Invariants are the backbone of smart contract fuzzing. Unlike “normal” software, smart contracts typically don’t crash due to memory corruption. What you care about are violated assumptions: broken accounting, authorization issues, and so on.

Here’s a simple but powerful invariant:

```rust
#[cfg(feature = "cosmfuzz")]
pub mod cosmfuzz {
    ...
    
    // Total supply >= sum of all balances invariant
    pub fn invariant_testing_query(app: &App, cw20_base_addr: &Addr) {
        let mut sum_of_balances = Uint128::zero();

        let accounts: AllAccountsResponse = app
            .wrap()
            .query_wasm_smart(
                cw20_base_addr,
                &QueryMsg::AllAccounts {
                    start_after: None,
                    limit: Some(30),
                },
            )
            .expect("We initialized accounts before");

        let token_supply = TOTAL_INITIAL_BALANCE * accounts.accounts.len() as u128;

        for account in accounts.accounts {
            let balance: BalanceResponse = app
                .wrap()
                .query_wasm_smart(
                    cw20_base_addr,
                    &QueryMsg::Balance {
                        address: account.to_string(),
                    },
                )
                .expect("We gave the accounts a balance");
            sum_of_balances += balance.balance;
        }

        assert!(
            token_supply >= sum_of_balances.into(),
            "Invariant hit: Sum of all balances is bigger than the initial token supply"
        );
    }
}
```

This enforces a very basic rule: the sum of all balances must never exceed the total supply.

Why does this matter? Because it catches minting bugs. If the supply is supposed to be fixed at initialization, and some sequence of messages causes the account balances to add up to more than that, something is broken.

That’s exactly what our off-by-one transfer bug does: each transfer mints an extra token, and eventually the invariant asserts.

### Initializing and configuring the campaign

With `setup()` and invariants in place, we can initialize the fuzzer:

```bash
cosmfuzz init
```

This generates the `cosmfuzz-config.toml` file, where you can tune settings like the number of jobs, timeouts, etc. For this demo we only bump `jobs` from 1 to 3 to speed things up. Everything else stays default. Check out the [docs](https://github.com/ogechno/cosmfuzz/blob/main/docs/configuration.md) for the full list of options.

## Running the fuzzing campaign

Now we are getting to the part we work towards, running the fuzzer:

```bash
cosmfuzz fuzz
```

This will launch the ziggy UI, where you can see how many instances are running, what the current coverage is, executions per second and how many crashes have been found by the fuzzer. For CosmFuzz, "crashes" typically mean an invariant violation.

![ziggy ui](https://srlabs.de/img/content/blog/post-assets/cosmwasm/ziggy-320.616063f6fd.avif)

Figure 1: ziggy ui showing crashes

In the screenshot above, we can observe that we got **15 crashes** after only a minute. Showcasing the effectiveness of the setup. Next, we need to figure out what caused these crashes.

## Triaging the crash

Once CosmFuzz reports crashes, the next step is to replay them and see which invariant got hit. Crashing inputs are stored `<fuzz_dir>/output/crashes` (configured via `fuzz_dir` in `cosmfuzz-config.toml`).

For our example, you can run all crashes like this:

```text
cosmfuzz run /tmp/cosmfuzz/cw20-base/output/crashes/*
```

This prints a stack trace. If the crash is an invariant violation, it also prints which invariant failed and the input that triggered it. In our case:

```bash
thread 'main' panicked at ~/cw-plus/cosmfuzz/contracts/cw20-base/src/lib.rs:111:9:
assertion `left == right` failed: Total supply (200) must equal sum of balances (193)
  left: Uint128(200)
 right: Uint128(193)
stack backtrace:
```

**Awesome!** That tells us we hit the invariant, and it happened because of the off-by-one transfer bug we planted. Exactly what we wanted to demonstrate: the fuzzer found the accounting failure through stateful execution and invariant checking.

## Beyond the basics

In this walkthrough we only covered the fundamentals of what CosmFuzz can do. There’s quite a bit more in the toolbox already:

-   **Coverage reports**: With `cosmfuzz cover` you can generate coverage reports to evaluate how much of your contract logic your campaign actually explored, and to spot blind spots that might need a more guided approach.
-   **Multi-contract interactions**: Most contracts are not isolated, they depend on and interact with other contracts. CosmFuzz has basic support for multi-contract fuzzing today. We’re actively working on a smoother UX and plan to ship a revamped version of this feature.
-   **Seed management and corpus hygiene**: You can add new seeds and minimize the corpus, which is useful once the fuzzing campaign scales.

Things we’d like to support next:

-   **Native chain features via custom `cw-multi-test` forks**: So teams can model their chain specific quirks more realistically.
-   **Easier custom seed creation**: Especially for when the fuzzers coverage hits a plateau and needs a nudge towards new state.

## Conclusion

In this post we introduced CosmFuzz, a coverage-guided smart contract fuzzer for CosmWasm. We walked through a typical fuzzing campaign by deliberately introducing a bug in `cw20-base`, defined a setup function and a supply invariant, ran the fuzzer, and triaged the resulting crashes back to the invariant violation.

The main takeaway is that fuzzing doesn’t have to mean weeks of setup. CosmFuzz is meant to make these campaigns easy to bootstrap with very little overhead for developers. We’re always open to suggestions to improve CosmFuzz, and to help push the security of the Blockchain ecosystem forward. Tschau!

* * *

### What We’ve Covered and What’s Ahead

Missed an article? Here’s the list:

✅ #0: [Fuzzing Made Easy: Outline](https://srlabs.de/blog/fuzzing-made-easy-outline)

✅ #1: [How to write a harness](https://srlabs.de/blog/guide-to-writing-fuzzing-harness)

✅ #2: [Unlocking the secrets of effective fuzzing harnesses](https://srlabs.de/blog/unlocking-secrets-effective-fuzzing-harness)

✅ #3: [GoLibAFL: Fuzzing Go binaries using LibAFL](https://srlabs.de/blog/golibafl---fuzzing-go-binaries-using-libafl)

#4: How to write harnesses for Rust and Python and fuzz them

✅ #5: [How to decide what to fuzz in a complex target](https://srlabs.de/blog/decide-what-to-fuzz)

#6: The different types of fuzzing harnesses

#7: Effective Seeding

✅ #8: [How to perform coverage analysis](https://srlabs.de/blog/coverage-analysis)

#9: Correctly minimizing corpora

#10: How to run fuzzing campaigns

#11: Continuous fuzzing campaigns

#### Special Fuzzing Targets

✅ #1: [Fuzzing CosmWasm Smart Contracts](https://srlabs.de/blog/cosmwasm)

# Arise Functions

Like most larger projects build in Bash, Arise is a modular program split up into functions. The folders in this directory contain the source files for each function defined for use by Arise.

## Implementation Notes

Bash is an interesting language because its functions are "fake" in the sense that they are simply a reader-friendly way of performing command grouping operations and nothing more. They are not capable of actually returning data in the way that functions do in most other programming languages. What's more fun is that unless you're careful, modifications to environment variables within a function will carry over to subsequent actions outside of that function due to the dynamic variable scoping in Bash.

As a result of this limitation, Arise makes use of subshells to work around limitations with variable scoping and shell variables. While this may not be the most efficient workaround, it prevents the dynamic scoping of environment conditions from within subshell functions from contaminating parent functions. Not all functions need this, and thus many functions are simply run inline instead of being routed into a subshell.

There are two types of functions Arise uses are referred to as **Inline** and **Subshell**. The difference between these two function categories is that **Inline** functions are declared with `{}` and **Subshell** functions are declared with `()`. For organisational purposes, these two respective function categories have their own respective folder for source files

Upon program run, Arise pulls in all `*.sh` files in both the `inline` and `subshell` directories. As a convention, each function is broken up into its own source file. The convention used for naming source files is `function_name.sh`. Documentation for individual functions and their usage can be found in the comments at the top of each function source file.

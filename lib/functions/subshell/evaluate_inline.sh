#!/bin/bash
#############
# DESCRIPTION
#############
# Evaluates inline bash snippets when building pages.
#
# This functionality is currently disabled for initial release because even though it "works". When called by build_page, the parsing isn't very good and the syntax for calling an inline evaluation could use some work.
#
#############
# Function Usage: 
# evaluate_inline index.html
#
# Inline Snippet Usage:
# <pre>sh# echo "Hello World!" </pre>

evaluate_inline() (

evaluation_source=$(basename $1)
cd $(dirname $1)

while grep "<pre>sh#" $evaluation_source
do
        replacement=$(bash <<< $(sed -n -e s$'\001''<pre>sh#\(.*\)</pre>'$'\001''\1'$'\001''p' < $evaluation_source | head -1))
        awk 'NR==1,/<pre>sh#.*<\/pre>/{sub(/<pre>sh#.*<\/pre>/, "'"$replacement"'")}{print >"'"$evaluation_source"'"}' $evaluation_source || break
done
)

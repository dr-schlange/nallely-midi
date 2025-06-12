#!/bin/bash
#############                                                                                            
# DESCRIPTION
#############
# Creates a table of contents at the location of the specified source file.
# 
#############
# Usage:
# build_toc index.md

build_toc() (

# Throw the metadata header together and add the source file to the list of files to remove in cleanup
toc_source=$(basename $1)
cd $(dirname $1)
get_page_metadata $toc_source
echo "$(realpath $toc_source)" >> $removelist
build_header index.html

# Add the title and start of the table for the TOC
cat >> index.html <<EOF
        <h1>$title</h1> 
        <p id="arise-toc">
        <table id="arise-toc-table">
        <tr class="arise-toc-tr">
                <th class="arise-toc-th">Date</th>
                <th class="arise-toc-th">Title</th>
                <th class="arise-toc-th">Description</th>
        </tr>
EOF
clear_metadata

# Make each entry into an individual table row. For now we're storing these in a temp file so that we can sort if after we're done generating all the entries in the TOC.
toc_tmp="arise-toc-$RANDOM.tmp"
find . -mindepth 2 -maxdepth 2 -type f -name 'index.md' | while read fname; do
get_page_metadata $fname
echo '<tr class="arise-toc-tr"><td class="arise-toc-td">'"$published_date"'</td><td class="arise-toc-td"><a href="'"$canonical_url"'">'"$title"'</a></td><td class="arise-toc-td">'"$description"'</td></tr>' >> $toc_tmp
clear_metadata
done

# Sort all of our contents by date so that they're not in random order
sort -r $toc_tmp >> index.html
rm $toc_tmp

# Final page bits
cat >> index.html <<EOF
        </table>
        </p>
EOF
build_footer index.html
)

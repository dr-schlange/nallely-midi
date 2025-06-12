#!/bin/bash
#############                                                                                            
# DESCRIPTION
#############
# Recursively crawls through the site and reads page metadata to generate an RSS feed for all content on the website.
#
# The script will output the completed RSS feed to the location specified as an argument.
#
#############
# Usage:
# build_rss rss.xml

build_rss() (

# Switch to rss file's directory
touch $1
rss=$(realpath $1)
cd $(dirname $1)

# Wipe out the existing rss feed, if there is one, and declare our new rss feed
# Note that metadata descriptors are pulled from the index.md file that lives in the same folder as the destination for the rss.xml file.
get_page_metadata index.md
cat > $rss <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" version="2.0">
  <channel>
    <title>$global_name</title>
    <description>$description</description>
    <link>$base_url</link>
    <language>$language</language>
    <generator>Arise</generator>
EOF

[[ $favicon != '' ]] && {
        cat >> $rss <<EOF
    <image>
      <url>$base_url$favicon</url>
      <title>$global_name</title>
      <link>$base_url</link>
    </image>
EOF
}

cat >> $rss <<EOF
    <atom:link href="$base_url/rss.xml" rel="self" type="application/rss+xml"/>
        <ttl>60</ttl>
<lastBuildDate>$(date --rfc-822)</lastBuildDate>
EOF

# List every directory in our sitemap (except config). This makes up our sitemap since Arise is built to use directory roots as page URLs
find . -type d -not \( -path ./config -prune \) | while read fname; do
page_index=$(realpath "$fname"'/index.md')

        if [ -e $page_index ]; then
                get_page_metadata $page_index

                if [[ $rss_hide != "true" ]] && [[ $is_toc != "true" ]]; then
                        # Convert html's ISO8601 date to RSS's RFC-822. Fuck you RSS.
                        rss_date=$(date -d "$published_date" --rfc-822)
                        
                        cat >> $rss <<EOF
        <item>
        <title>$title</title>
        <dc:creator>$author</dc:creator>
        <description>$description</description>
        <link>$canonical_url</link>
        <pubDate>$rss_date</pubDate>
        </item>
EOF
                fi
                clear_metadata
        fi
done

# Close up the rss feed
echo -e '</channel>\n</rss>' >> $rss

)

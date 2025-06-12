#!/bin/bash
#############                                                                                            
# DESCRIPTION
#############
# Pulls all the Arise-specific metadata from the header of a given page.
#
# This function is meant to be run inline before other functions so that it can populate the information other functions need to operate upon.
#
#############
# Usage:
# get_page_metadata source.md

get_page_metadata() {
        if [[ -e $1 ]]; then
                metadata=$(sed -e '/END ARISE/,$d' < $1)

                # Main page metadata
                title="$(grep "Title::" <<< $metadata)" # Grab the line with the metadata we want
                title="${title%\"}" # Remove the trailing quote at the end
                title="${title#Title:: }" # Remove the name of the metadata variable from the start
                title="${title#\"}" # Remove the quote at the start of the parsed variable

                author="$(grep "Author::" <<< $metadata)"
                author="${author%\"}"
                author="${author#Author:: }"
                author="${author#\"}"
                
                description="$(grep "Description::" <<< $metadata)"
                description="${description%\"}"
                description="${description#Description:: }"
                description="${description#\"}"

                language="$(grep "Language::" <<< $metadata)"
                language="${language%\"}"
                language="${language#Language:: }"
                language="${language#\"}"
                
                thumbnail="$(grep "Thumbnail::" <<< $metadata)"
                thumbnail="${thumbnail%\"}"
                thumbnail="${thumbnail#Thumbnail:: }"
                thumbnail="${thumbnail#\"}"

                published_date="$(grep "Published Date::" <<< $metadata)"
                published_date="${published_date%\"}"
                published_date="${published_date#Published Date:: }"
                published_date="${published_date#\"}"

                modified_date="$(grep "Modified Date::" <<< $metadata)"
                modified_date="${modified_date%\"}"
                modified_date="${modified_date#Modified Date:: }"
                modified_date="${modified_date#\"}"

                # Clean metadata of XML special characters so we don't break the sitemap or RSS feed
                title="$(clean_xml_string "$title")"
                author="$(clean_xml_string "$author")"
                description="$(clean_xml_string "$description")"
                language="$(clean_xml_string "$language")"
                thumbnail="$(clean_xml_string "$thumbnail")"
                published_date="$(clean_xml_string "$published_date")"
                modified_date="$(clean_xml_string "$modified_date")"
                
                # Optional page settings with default settings

                # is_toc default: false
                is_toc=$(grep "toc::" <<< $metadata | cut -d '"' -f2)
                if [[ $is_toc != "true" ]]; then
                        is_toc="false"
                fi
                        
                # process_markdown default: true
                process_markdown=$(grep "process_markdown::" <<< $metadata | cut -d '"' -f2)
                if [[ $process_markdown != "false" ]]; then
                        process_markdown="true"
                fi
                
                # content_header default: true
                content_header=$(grep "content_header::" <<< $metadata | cut -d '"' -f2)
                if [[ $content_header != "false" ]]; then
                        content_header="true"
                fi

                # rss_hide default: false
                rss_hide=$(grep "rss_hide::" <<< $metadata | cut -d '"' -f2)
                if [[ $rss_hide != "true" ]]; then
                        rss_hide="false"
                fi
                
                # URL
                relative_url="$(realpath $(dirname $1) | sed 's@.*arise-out@@g')"'/'
                canonical_url="$base_url""$relative_url"
        else
                # Clear out metadata so that anything calling this function expecting to get new data cannot get old values on accident if the requested file does not exist.
                clear_metadata
        fi

} 

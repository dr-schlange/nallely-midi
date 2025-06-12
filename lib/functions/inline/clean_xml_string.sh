#!/bin/bash
#############                                                                                            
# DESCRIPTION
#############
# Cleans special characters out of a string intended for use in xml format
#
#############
# Usage:
# clean_xml_string "string with special characters"

clean_xml_string() {
# unclean string -> clean string
        input_string="$1"
        # replace & with &amp;
        input_string=${input_string//\&/\&#38;}
        # replace < with &lt;
        input_string=${input_string//</\&#60;}
        # replace > with &gt;
        input_string=${input_string//>/\&#62;}
        # replace ' with &apos;
        input_string=${input_string//\'/\&#39;}
        # replace " with &quot;
        input_string=${input_string//\"/\&#34;}
        echo "$input_string"
}

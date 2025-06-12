#!/bin/bash
#############                                                                                            
# DESCRIPTION
#############
# Appends the footer/closing tags to a page.
#
#############
# Usage:
# build_footer destination.html

build_footer() {
        cat $config/footer.html >> $1
}

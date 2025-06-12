#!/bin/bash
#############                                                                                            
# DESCRIPTION
#############
# Clears the metadata variables to prevent metadata from carrying over to the wrong page. This is important because of how promiscuous bash is with its variables.
#
#############
# Usage:
# clear_metadata

clear_metadata() {
        metadata=''
        title=''
        author=''
        description=''
        language=''
        thumbnail=''
        published_date=''
        modified_date=''
        relative_url=''
        canonical_url=''
} 

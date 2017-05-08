# point-cloud.R

# Copyright 2017 Confluent Medical Technologies
# Released as part of nitinol-design-concepts
# https://github.com/confluentmedical/nitinol-design-concepts
# under terms of Apache 2.0 license
# http://www.apache.org/licenses/LICENSE-2.0.txt

# if you are starting with a new R installation, install with the following commands.
#install.packages('tidyverse','rstudioapi')
library(tidyverse) # http://r4ds.had.co.nz

# set working directory to location of this script
setwd(dirname(rstudioapi::getActiveDocumentContext()$path)) 

# read the field output results table
results <- read_table('open-frame-fatigue-v25mm-9pct.rpt', 
                      skip=19, col_names = FALSE)

# set names for the columns
colnames(results) <- c('elNum','intPt','eMean','eAmp')

# create a point cloud
pointCloud <- ggplot(results,aes(x=eMean,y=abs(eAmp))) +
  geom_point() +
  ylab('strain amplitude') +
  xlab('mean strain') +
  scale_y_continuous(labels = scales::percent) +
  scale_x_continuous(labels = scales::percent) +
  ggtitle('point cloud','open-frame-fatigue-v25mm-9pct')

# plot the result
plot(pointCloud)

# save as a PNG file
ggsave('point-cloud.png')



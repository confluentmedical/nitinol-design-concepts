# monte-carlo-visualize.R
#
# Copyright 2017 Confluent Medical Technologies, Inc
# 
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
# http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# overview --------------------------------------------------------------------

# visualize results of monte-carlo analysis

# IN:    *.mc.csv results created by monte-carlo-xct-fea.R (from ./mc-out folder)
# OUT:   PNG and PDF plots in ./mc-pdf and ./mc-png folders

# NEXT:  we are done for now!

# Clear environment and load packages -----------------------------------------

# install required packages if necessary 
# install.packages('tidyverse')
# install.packages('rstudioapi')

rm(list=ls())
library(tidyverse)           # http://r4ds.had.co.nz/

# file management  ------------------------------------------------------------

# set working directory to location of this script
# note: this is problematic because in RStudio, the default working directory
# is the project folder, and this is one level down (so we will suffer from
# file-not-found errors if we don't fix this). There is not an easy fix.
# this approach requires the rstudioapi package. see also:
# http://stackoverflow.com/questions/13672720/r-command-for-setting-working-directory-to-source-file-location
setwd(dirname(rstudioapi::getActiveDocumentContext()$path)) 

# read results from monte-carlo runs
# in this case, 500 runs for each material
df <- read_csv('./mc-out/open-frame-fatigue-v25mm-9pct-500se508-500eli.mc.csv')

# identification to include in plot file names
file_ident <- 'mc500'

# create folders for results if they do not already exist
dir.create('mc-pdf', showWarnings = FALSE)
dir.create('mc-png', showWarnings = FALSE)


# helper functions  -----------------------------------------------------------

# function to save file as PDF and PNG
# PDF files are generally preferred, but
# get large and unwieldy with many points are plotted
savePdfPng <- function(name){
  ggsave(paste('mc-pdf/',file_ident,'-',name,'.pdf',sep=''),
         width=8,height=6)
  ggsave(paste('mc-png/',file_ident,'-',name,'.png',sep=''),
         width=8,height=6,dpi = 300)
}

# organize data for plotting  -------------------------------------------------

# rearrange data frame, gathering values spead across multiple columns
# so there is one value per row. "ident" is the name of the original column
# from which the value was taken, and "value" is the value itself.
# add column "orient" containing the r/theta/z orientation
# add column suffix containing the descriptor (q99 = 99th percentile,
# q50 = 50th percentile, etc)

df <- df %>%
  arrange(matl,ident) %>%
  mutate(matl = as.factor(matl),
         ident = as.factor(ident)) %>%
  group_by(matl,ident) %>%
  gather('key','value',4:28) %>%
  rowwise() %>%
  mutate(orient = substr(key,1,regexpr("\\.",key)[1]-1),
         suffix = substr(key,regexpr("\\.",key)[1]+1,nchar(key)))

# spread the data back out across columns
# now organized with columns to identify the orientation and descriptor
# some values are not calculated, and appear as zeros...
# change zeros to NA to make this clear

df <- df %>%
  spread(suffix,value) %>%
  select(-key) %>%
  group_by(ident,matl,run,orient) %>%
  summarise_each(funs(sum(., na.rm=TRUE))) %>%
  ungroup() %>%
  mutate(cycEA = ifelse(cycEA==0,NA,cycEA),
         cycSA = ifelse(cycSA==0,NA,cycSA),
         D     = ifelse(D==0,NA,D),
         dK    = ifelse(dK==0,NA,dK),
         dS    = ifelse(dS==0,NA,dS),
         k     = ifelse(k==0,NA,k),
         q50   = ifelse(q50==0,NA,q50),
         q99   = ifelse(q99==0,NA,q99))

# plot the results  -----------------------------------------------------------

# for relabeling the orientation labels
coords <- c(`dK11`='r',
            `dK22`='theta',
            `dK33`='Z')

# plot max(dK) vs max(K@max(dK)) for each orientation
# this shows 1) the Z orientation is most critical in this case
# and 2) 
dK.vs.K <- ggplot(data=filter(df,orient=='dK11'|orient=='dK22'|orient=='dK33'),
                  aes(x=k,y=dK,color=matl)) +
  geom_point(alpha=1/4) +
  facet_grid(. ~ orient, labeller = as_labeller(coords)) +
  ylab(expression(paste(Delta,'K'))) +
  xlab('K') +
  labs(color = 'material') +
  ggtitle(expression(paste('stress intensity factor: maximum ',Delta,'K and corresponding K')),
          'for 500 monte carlo runs with each material')
plot(dK.vs.K)
savePdfPng('dK-vs-K')

# "fortune plot" of dK's components, delta stress and defect size
fortune <- ggplot(data=filter(df,orient=='dK33'),aes(x=D,y=dS,color=dK)) +
  geom_point(alpha=1/2) +
  facet_grid(matl ~ .) +
  scale_colour_gradientn(colours = rev(RColorBrewer::brewer.pal(5,'Spectral'))) +
  xlab(expression(paste(sqrt(area[xy]),'(',mu,`m)`))) +
  ylab(expression(paste(Delta,sigma[z],` (MPa)`))) +
  labs(color = expression(paste(Delta,K[z]))) +
  ggtitle(expression(paste('max. ',Delta,K[z], ' by cyclic stress and defect (inclusion) size')),
          'unluckiest combination at upper right: largest defect at highest cyclic stress')
plot(fortune)
savePdfPng('fortune')

# histogram: maximum K for each orientation
max.K <- ggplot(data=filter(df,
                            orient=='dK11'|
                              orient=='dK22'|
                              orient=='dK33'),aes(x=k,fill=matl)) +
  geom_histogram() +
  facet_grid(. ~ orient, labeller = as_labeller(coords)) +
  xlab(expression(paste('K',` (MPa`,sqrt(m),')'))) +
  labs(fill = 'material') +
  ggtitle('maximum stress intensity factor',
          'for 500 monte carlo runs with each material')
plot(max.K)
savePdfPng('max-K')

# histogram: maximum dK for each orientation
max.dK <- ggplot(data=filter(df,
                           orient=='dK11'|
                             orient=='dK22'|
                             orient=='dK33'),aes(x=dK,fill=matl)) +
  geom_histogram() +
  facet_grid(. ~ orient, labeller = as_labeller(coords)) +
  xlab(expression(paste(Delta,'K',` (MPa`,sqrt(m),')'))) +
  labs(fill = 'material') +
  ggtitle('maximum delta stress intensity factor',
          'for 500 monte carlo runs with each material')
plot(max.dK)
savePdfPng('max-dK')

# max dK vs defect (inclusion) size
max.dK.v.D <- ggplot(data=filter(df,orient=='dK33'),aes(x=D,y=dK,color=matl)) +
  geom_point(alpha=1/5) +
  xlab(expression(paste(sqrt(area[xy]),'(',mu,`m)`))) +
  ylab(expression(paste(Delta,K[z],` (MPa`,sqrt(m),')'))) +
  ggtitle('maximum stress intensity factor depends strongly on defect (inclusion) size',
          '500 monte carlo runs with each material')
plot(max.dK.v.D)
savePdfPng('max-dK-D')

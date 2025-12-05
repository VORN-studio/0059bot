// No need to clear localStorage for free play version

             var oMain = new CMain({
                        
                            start_credit:1000,    //STARTING CREDIT WHEN PLAYER PLAYS THE FIRST TIME - INCREASED FOR FREE PLAY
                            
                            win_occurrence: 45,  //INCREASED WIN PERCENTAGE FOR FREE PLAY
                            freespin_occur : 15, //INCREASED FREESPIN OCCURRENCE FOR MORE FUN
                            bonus_occur: 15,     //INCREASED BONUS OCCURRENCE FOR MORE EXCITEMENT
                            slot_cash: 50000,      //INCREASED SLOT CASH FOR FREE PLAY - MORE GENEROUS PAYOUTS

                            num_freespin: [3,4,5],//THIS IS THE NUMBER OF FREESPINS IF IN THE FINAL WHEEL THERE ARE 3,4 OR 5 FREESPIN SYMBOLS
                            bonus_prize: [10,30,60,90,100], //THIS IS THE LIST OF BONUS MULTIPLIERS.
                            bonus_prize_occur: [40,25,20,10,5],//OCCURRENCE PERCANTAGE FOR bonus_prize LIST
                            coin_bets: [1, 2, 5, 10, 15, 20, 25, 30, 40, 50], //INCREASED COIN BET VALUES FOR FREE PLAY

                            /***********PAYTABLE********************/
                            //EACH SYMBOL PAYTABLE HAS 5 VALUES THAT INDICATES THE MULTIPLIER FOR X1,X2,X3,X4 OR X5 COMBOS
                            paytable : [ 
                                                    [0,0,5,20,100],    //PAYTABLE FOR SYMBOL 0
                                                    [0,0,5,20,100], //PAYTABLE FOR SYMBOL 1
                                                    [0,0,5,20,100], //PAYTABLE FOR SYMBOL 2
                                                    [0,0,10,30,150],  //PAYTABLE FOR SYMBOL 3
                                                    [0,0,20,50,200],   //PAYTABLE FOR SYMBOL 4
                                                    [0,0,25,70,300],   //PAYTABLE FOR SYMBOL 5
                                                    [0,0,25,100,500]   //PAYTABLE FOR SYMBOL 6

                                                ],
                            freespin_num_occur: [50,30,20],//WHEN PLAYER GET FREESPIN, THIS ARRAY GET THE OCCURRENCE OF RECEIVING 3,4 OR 5 FREESPIN SYMBOLS IN THE WHEEL
                            
                            min_reel_loop:0,           //NUMBER OF REEL LOOPS BEFORE SLOT STOPS  
                            reel_delay: 1,             //NUMBER OF FRAMES TO DELAY THE REELS THAT START AFTER THE FIRST ONE
                            time_show_win:500,        //DURATION IN MILLISECONDS OF THE WINNING COMBO SHOWING
                            time_show_all_wins: 500,  //DURATION IN MILLISECONDS OF ALL WINNING COMBO
                            restart_credit:false,      //IF YOU WANT TO RESTART USER CREDIT WITH DEFAULT VALUE SET THIS TO TRUE   
                            check_orientation:false,    //SET TO FALSE IF YOU DON'T WANT TO SHOW ORIENTATION ALERT ON MOBILE DEVICES
                            audio_enable_on_startup:false, //ENABLE/DISABLE AUDIO WHEN GAME STARTS 
                            show_credits:true,              //SHOW CREDITS ON/OFF - ENABLED FOR FREE PLAY
                            num_spin_for_ads: 50        //NUMBER OF TURNS PLAYED BEFORE AD SHOWING //
                            
                            //////// THIS FEATURE  IS ACTIVATED ONLY WITH CTL ARCADE PLUGIN./////////////////////////// 
                            /////////////////// YOU CAN GET IT AT: ////////////////////////////////////////////////////
                            // http://codecanyon.net/item/ctl-arcade-wordpress-plugin/13856421
                        });


                $(oMain).on("bet_placed",function(evt,oData){
                    var fCoin = oData.bet;
                    var fTotBet = oData.tot_bet;
                    var iLinesBet = oData.payline;
                    
                    // Use local spin function instead of server API
                    APIAttemptSpin(fTotBet,fCoin,iLinesBet,s_oGame.onSpinReceived, s_oGame );
                });
            
            $(oMain).on("bonus_call",function(evt,oData){
                var fCoin = oData.bet;
                apiAttemptBonus(fCoin,s_oGame.onBonusStart,s_oGame);
            });
            
            $(oMain).on("recharge", function(evt) {
                // Reset to starting credits for free play
                var iMoney = 1000;
                refreshCredit(iMoney,s_oGame.refreshMoney,s_oGame);
            });
            
            $(oMain).on("start_session", async function(evt) {
                console.log(evt);
                    if(getParamValue('ctl-arcade') === "true"){
                        parent.__ctlArcadeStartSession();
                    }
                    
                    // Start with virtual credits for free play
                    var startCredits = 1000;
                    refreshCredit(startCredits,s_oGame.refreshMoney,s_oGame);
            });

            $(oMain).on("end_session", function(evt) {
                    //if(getParamValue('ctl-arcade') === "true"){
                    //    parent.__ctlArcadeEndSession();
                    //}
                    // Return to main page for free play
                    window.location = 'index.html';
            });

            $(oMain).on("save_score", async function(evt,iScore) {
                    if(getParamValue('ctl-arcade') === "true"){
                        parent.__ctlArcadeSaveScore({score:iScore});
                    }
                    // No server saving needed for free play - just log the score
                    console.log("Game score saved locally:", iScore);
            });

            
            $(oMain).on("show_interlevel_ad", function(evt) {
                    if(getParamValue('ctl-arcade') === "true"){
                        parent.__ctlArcadeShowInterlevelAD();
                    }

            });
            
            
            if(isIOS()){
                setTimeout(function(){sizeHandler();},200); 
            }else{ 
                sizeHandler(); 
            }

